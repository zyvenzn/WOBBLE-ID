import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { AssetError } from "../src/asset.js";
import { assetCoverage, checkAsset, findAsset, listAssets } from "../src/asset-files.js";
import { boxAsset, makeGlb } from "./glb-helper.js";

let root;

async function addAsset(id, { category = "props", status = "draft", glb = true, meta } = {}) {
  const dir = path.join(root, category, id);
  await mkdir(dir, { recursive: true });
  const box = boxAsset(id);
  const record = { ...box.meta, category, status, ...meta };
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(record));
  if (glb) await writeFile(path.join(dir, `${id}.glb`), makeGlb(box.gltf, box.bin));
  return { id, category, dir };
}

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wobble-assets-"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

test("findAsset locates an asset in any category and rejects bad ids", async () => {
  await addAsset("voxel_flask");
  const found = await findAsset("voxel_flask", root);
  assert.equal(found.category, "props");
  assert.equal(await findAsset("voxel_unknown", root), null);
  await assert.rejects(() => findAsset("../etc/passwd", root), AssetError);
  await assert.rejects(() => findAsset("Voxel Flask", root), AssetError);
});

test("listAssets returns assets sorted by category then id", async () => {
  await addAsset("wobble_character", { category: "characters" });
  const list = await listAssets(root);
  const ids = list.map((asset) => `${asset.category}/${asset.id}`);
  assert.ok(ids.indexOf("characters/wobble_character") < ids.indexOf("props/voxel_flask"));
  assert.deepEqual(await listAssets(path.join(root, "nope")), []);
});

test("checkAsset: a valid asset has no errors", async () => {
  const asset = await addAsset("voxel_ok", { status: "approved" });
  const result = await checkAsset(asset);
  assert.deepEqual(result.errors, []);
  assert.equal(result.status, "approved");
  assert.equal(result.stats.triangles, 12);
});

test("checkAsset: a draft without a GLB only warns, an approved one fails", async () => {
  const draft = await checkAsset(await addAsset("voxel_draft", { glb: false }));
  assert.deepEqual(draft.errors, []);
  assert.ok(draft.warnings.some((m) => m.includes("missing")));

  const approved = await checkAsset(await addAsset("voxel_nofile", { status: "approved", glb: false }));
  assert.ok(approved.errors.some((m) => m.includes("voxel_nofile.glb is missing")));
});

test("checkAsset: metadata that does not match the folder is an error", async () => {
  const asset = await addAsset("voxel_wrong", { meta: { id: "voxel_other", category: "characters" } });
  const result = await checkAsset(asset);
  assert.ok(result.errors.some((m) => m.startsWith("id:")));
  assert.ok(result.errors.some((m) => m.startsWith("category:")));
});

test("checkAsset: a broken GLB is reported, not thrown", async () => {
  const asset = await addAsset("voxel_broken");
  await writeFile(path.join(asset.dir, "voxel_broken.glb"), Buffer.from("not a glb, but long enough to parse"));
  const result = await checkAsset(asset);
  assert.ok(result.errors.some((m) => m.includes("Not a GLB")));
});

test("assetCoverage reports what a brief can use and what is still to build", async () => {
  await addAsset("voxel_cov_ok", { status: "approved" });
  await addAsset("voxel_cov_review", { status: "review" });
  await addAsset("voxel_cov_nofile", { status: "approved", glb: false });
  const dir = path.join(root, "props", "voxel_cov_bad");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "voxel_cov_bad.json"), "{ broken");

  const result = await assetCoverage(
    ["voxel_cov_ok", "voxel_cov_review", "voxel_cov_nofile", "voxel_cov_bad", "voxel_cov_new", "Bad Id", "voxel_cov_ok"],
    root
  );
  const states = Object.fromEntries(result.map((row) => [row.id, row.state]));
  assert.deepEqual(states, {
    voxel_cov_ok: "approved",
    voxel_cov_review: "review",
    voxel_cov_nofile: "no-glb",
    voxel_cov_bad: "unreadable",
    voxel_cov_new: "missing",
    "Bad Id": "invalid-id"
  });
  assert.equal(result.length, 6); // duplicates collapsed
});
