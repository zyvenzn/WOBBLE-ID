import assert from "node:assert/strict";
import { test } from "node:test";
import { AssetError, parseGlb, validateGlb, validateMetadata } from "../src/asset.js";
import { boxAsset, makeGlb } from "./glb-helper.js";

const ID = "voxel_box";

function check(mutate, { metaMutate, options } = {}) {
  const { gltf, bin, meta } = boxAsset(ID);
  mutate?.(gltf);
  metaMutate?.(meta);
  return validateGlb(gltf, bin, meta, { id: ID, category: "props", ...options });
}

const has = (list, text) => list.some((message) => message.includes(text));

test("metadata: a complete record passes", () => {
  const { meta } = boxAsset(ID);
  const { errors } = validateMetadata(meta, { id: ID, category: "props" });
  assert.deepEqual(errors, []);
});

test("metadata: id, category, status and custom origin are checked", () => {
  const { meta } = boxAsset(ID);
  const { errors } = validateMetadata(
    { ...meta, id: "other_thing", category: "weapons", status: "done", originRule: "custom" },
    { id: ID, category: "props" }
  );
  assert.ok(has(errors, "id:"));
  assert.ok(has(errors, "category:"));
  assert.ok(has(errors, "status:"));
  assert.ok(has(errors, "notes"));
});

test("metadata: zero bounds are fine in draft but not after", () => {
  const { meta } = boxAsset(ID);
  const zero = { ...meta, boundsM: { x: 0, y: 0, z: 0 } };
  assert.deepEqual(validateMetadata(zero, { id: ID, category: "props" }).errors, []);
  const { errors } = validateMetadata({ ...zero, status: "review" }, { id: ID, category: "props" });
  assert.ok(has(errors, "boundsM"));
});

test("GLB container: round trip, bad magic and truncation", () => {
  const { gltf, bin } = boxAsset(ID);
  const parsed = parseGlb(makeGlb(gltf, bin));
  assert.equal(parsed.json.nodes[0].name, ID);
  assert.equal(parsed.bin.length, bin.length);

  assert.throws(() => parseGlb(Buffer.from("this is not a glb file at all")), AssetError);
  const glb = makeGlb(gltf, bin);
  assert.throws(() => parseGlb(glb.subarray(0, glb.length - 10)), /truncated/);
});

test("a clean box passes with no errors or warnings", () => {
  const result = check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.stats.triangles, 12);
  assert.deepEqual(result.stats.bounds.size, [0.4, 0.6, 0.2]);
});

test("applied scale and rotation are required", () => {
  const scaled = check((g) => { g.nodes[1].scale = [2, 1, 1]; });
  assert.ok(has(scaled.errors, "scale"));

  const rotated = check((g) => { g.nodes[1].rotation = [0, 0.7071, 0, 0.7071]; });
  assert.ok(has(rotated.errors, "rotation"));

  const flipped = check((g) => { g.nodes[1].rotation = [0, 0, 0, -1]; });
  assert.deepEqual(flipped.errors, []); // -w is the same orientation
});

test("names: default Blender names and a wrong root are errors", () => {
  assert.ok(has(check((g) => { g.nodes[1].name = "Cube.001"; }).errors, "default name"));
  assert.ok(has(check((g) => { g.nodes[0].name = "something_else"; }).errors, "root node"));
  assert.ok(has(check((g) => { g.nodes[1].name = "body"; }).warnings, "voxel_box_<part>"));
});

test("root must sit at the world origin", () => {
  assert.ok(has(check((g) => { g.nodes[0].translation = [1, 0, 0]; }).errors, "world origin"));
});

test("textures are errors unless the metadata lists them", () => {
  const withImage = (g) => {
    g.images = [{ uri: "x.png" }];
    g.textures = [{ source: 0 }];
    g.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  };
  const rejected = check(withImage);
  assert.ok(has(rejected.errors, "embedded images"));
  assert.ok(has(rejected.errors, "uses a texture"));

  const allowed = check(withImage, { metaMutate: (m) => { m.textures = ["x.png"]; } });
  assert.deepEqual(allowed.errors, []);
});

test("materials: naming, count, metallic and unused ones", () => {
  assert.ok(has(check((g) => { g.materials[0].name = "Purple"; }).errors, "mat_"));

  const many = check((g) => {
    for (let i = 0; i < 8; i += 1) g.materials.push({ name: `mat_extra_${i}`, pbrMetallicRoughness: { metallicFactor: 0 } });
  });
  assert.ok(has(many.errors, "over the limit of 8"));
  assert.ok(has(many.warnings, "not used by any mesh"));

  const metal = check((g) => { delete g.materials[0].pbrMetallicRoughness.metallicFactor; });
  assert.ok(has(metal.warnings, "metallicFactor"));
});

test("triangle budget comes from the category and can be overridden", () => {
  const over = check(null, { options: { limits: { maxTriangles: { props: 10 } } } });
  assert.ok(has(over.errors, "over the props budget of 10"));
  assert.deepEqual(check().errors, []);
});

test("origin rule bottom-center: lifted or off-center models are errors", () => {
  const lifted = check((g) => { g.nodes[1].translation = [0, 0.5, 0]; });
  assert.ok(has(lifted.errors, "lowest point"));

  const shifted = check((g) => { g.nodes[1].translation = [1, 0, 0]; });
  assert.ok(has(shifted.errors, "not centered"));
});

test("origin rule center only warns", () => {
  const result = check(null, { metaMutate: (m) => { m.originRule = "center"; } });
  assert.deepEqual(result.errors, []);
  assert.ok(has(result.warnings, "model center"));
});

test("metadata that disagrees with the GLB is a warning", () => {
  const result = check(null, {
    metaMutate: (m) => {
      m.boundsM = { x: 0.4, y: 0.6, z: 0.2 }; // depth and height swapped
      m.triangles = 99;
      m.materials = ["mat_other"];
    }
  });
  assert.deepEqual(result.errors, []);
  assert.ok(has(result.warnings, "boundsM differs"));
  assert.ok(has(result.warnings, "99 triangles"));
  assert.ok(has(result.warnings, "materials do not match"));
});

test("vertices off the voxel grid are reported", () => {
  const { gltf, bin, meta } = boxAsset(ID);
  const off = Buffer.from(bin);
  off.writeFloatLE(0.23, 0); // first vertex x: -0.2 becomes 0.23
  delete gltf.accessors[0].min; // force reading from the data
  delete gltf.accessors[0].max;
  const result = validateGlb(gltf, off, meta, { id: ID, category: "props" });
  assert.ok(has(result.warnings, "not on the 0.1 m voxel grid"));
  assert.equal(result.stats.offGrid, 1);
});

test("compressed geometry and non-triangle meshes are errors", () => {
  assert.ok(has(check((g) => { g.extensionsRequired = ["KHR_draco_mesh_compression"]; }).errors, "compressed"));
  assert.ok(has(check((g) => { g.meshes[0].primitives[0].mode = 1; }).errors, "triangle meshes"));
});
