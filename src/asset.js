import { ASSET_ID } from "./brief.js";

// Voxel asset standards v1 (docs/ASSET_STANDARDS.md) as pure functions:
// no filesystem and no network, so everything here is testable offline.

export class AssetError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssetError";
  }
}

export const CATEGORIES = ["characters", "props", "environments"];
export const STATUSES = ["draft", "review", "approved"];
export const ORIGIN_RULES = ["bottom-center", "center", "custom"];

export const LIMITS = {
  voxelSizeM: 0.1,
  maxMaterials: 8,
  maxTriangles: { characters: 15000, props: 5000, environments: 50000 },
  toleranceM: 0.05, // bounds and origin checks
  gridToleranceM: 0.001 // how far a vertex may sit from the voxel grid
};

// Blender default object names that must not survive into a finished asset.
const DEFAULT_NAME = /^(Cube|Sphere|Plane|Cylinder|Cone|Torus|Circle|Empty|Mesh|Object)(\.\d+)?$/;
const TEXTURE_SLOTS = ["baseColorTexture", "metallicRoughnessTexture"];
const MATERIAL_TEXTURE_SLOTS = ["normalTexture", "occlusionTexture", "emissiveTexture"];
const EPS = 1e-6;

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";
const round = (value) => Math.round(value * 1000) / 1000;

// ---------------------------------------------------------------------------
// Metadata file (<asset_id>.json)

export function validateMetadata(meta, expected = {}) {
  const errors = [];
  const warnings = [];

  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { errors: ["metadata must be a JSON object"], warnings };
  }

  if (meta.version !== 1) errors.push(`version: expected 1, got ${JSON.stringify(meta.version)}`);

  if (!isNonEmptyString(meta.id) || !ASSET_ID.test(meta.id)) {
    errors.push(`id: "${meta.id}" is not a snake_case id`);
  } else if (expected.id && meta.id !== expected.id) {
    errors.push(`id: "${meta.id}" does not match the folder name "${expected.id}"`);
  }

  if (!CATEGORIES.includes(meta.category)) {
    errors.push(`category: must be one of ${CATEGORIES.join(", ")}`);
  } else if (expected.category && meta.category !== expected.category) {
    errors.push(`category: "${meta.category}" does not match the parent folder "${expected.category}"`);
  }

  if (!Number.isInteger(meta.assetVersion) || meta.assetVersion < 1) {
    errors.push("assetVersion: must be a whole number, 1 or more");
  }
  if (!STATUSES.includes(meta.status)) {
    errors.push(`status: must be one of ${STATUSES.join(", ")}`);
  }
  if (meta.voxelSizeM !== LIMITS.voxelSizeM) {
    errors.push(`voxelSizeM: must be ${LIMITS.voxelSizeM} in standards v1`);
  }

  if (!ORIGIN_RULES.includes(meta.originRule)) {
    errors.push(`originRule: must be one of ${ORIGIN_RULES.join(", ")}`);
  } else if (meta.originRule === "custom" && !isNonEmptyString(meta.notes)) {
    errors.push('originRule "custom" needs an explanation in notes');
  }

  const bounds = meta.boundsM;
  if (!bounds || !["x", "y", "z"].every((axis) => isNumber(bounds[axis]) && bounds[axis] >= 0)) {
    errors.push("boundsM: need numbers x, y, z (meters, 0 or more)");
  } else if (meta.status !== "draft" && ["x", "y", "z"].some((axis) => bounds[axis] === 0)) {
    errors.push("boundsM: sizes must be above 0 once the asset is past draft");
  }

  if (!Number.isInteger(meta.triangles) || meta.triangles < 0) {
    errors.push("triangles: must be a whole number, 0 or more");
  }
  if (!Array.isArray(meta.materials) || !meta.materials.every(isNonEmptyString)) {
    errors.push("materials: must be an array of material names");
  }
  if (!Array.isArray(meta.textures) || !meta.textures.every(isNonEmptyString)) {
    errors.push("textures: must be an array (empty when the asset uses none)");
  }
  if (meta.notes !== undefined && typeof meta.notes !== "string") {
    errors.push("notes: must be a string");
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// GLB container

export function parseGlb(buffer) {
  if (!(buffer instanceof Uint8Array)) {
    throw new AssetError("GLB data must be a Buffer or Uint8Array");
  }
  if (buffer.length < 20) throw new AssetError("File is too small to be a GLB");

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new AssetError("Not a GLB file (bad magic number)");
  if (view.getUint32(4, true) !== 2) throw new AssetError("Only GLB version 2 is supported");

  const total = view.getUint32(8, true);
  if (total > buffer.length) throw new AssetError("GLB is truncated (header length is larger than the file)");

  let json = null;
  let bin = null;
  let offset = 12;
  while (offset + 8 <= total) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end > total) throw new AssetError("GLB chunk runs past the end of the file");

    if (type === 0x4e4f534a && json === null) {
      try {
        json = JSON.parse(new TextDecoder().decode(buffer.subarray(start, end)));
      } catch (error) {
        throw new AssetError(`GLB JSON chunk is not valid JSON: ${error.message}`);
      }
    } else if (type === 0x004e4942 && bin === null) {
      bin = buffer.subarray(start, end);
    }
    offset = end;
  }

  if (json === null) throw new AssetError("GLB has no JSON chunk");
  return { json, bin };
}

// Flat [x, y, z, ...] positions, or null when they cannot be read plainly
// (sparse, quantized, no binary chunk).
function readPositions(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor || accessor.sparse || accessor.bufferView === undefined || !bin) return null;
  if (accessor.componentType !== 5126 || accessor.type !== "VEC3" || !Number.isInteger(accessor.count)) {
    return null;
  }
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView) return null;

  const stride = bufferView.byteStride || 12;
  const base = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  if (accessor.count === 0 || base + (accessor.count - 1) * stride + 12 > bin.byteLength) return null;

  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out = new Float64Array(accessor.count * 3);
  for (let i = 0; i < accessor.count; i += 1) {
    for (let k = 0; k < 3; k += 1) out[i * 3 + k] = view.getFloat32(base + i * stride + k * 4, true);
  }
  return out;
}

function primitiveTriangles(gltf, primitive) {
  const mode = primitive.mode ?? 4;
  const count = primitive.indices !== undefined
    ? gltf.accessors?.[primitive.indices]?.count
    : gltf.accessors?.[primitive.attributes?.POSITION]?.count;
  if (!Number.isInteger(count)) return null;
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return null;
}

function walkNodes(gltf, rootIndices, visit) {
  const seen = new Set();
  const go = (index, parent, depth) => {
    const node = gltf.nodes?.[index];
    if (!node || seen.has(index)) return;
    seen.add(index);
    const t = Array.isArray(node.translation) ? node.translation : [0, 0, 0];
    const world = [parent[0] + t[0], parent[1] + t[1], parent[2] + t[2]];
    visit(node, index, world, depth);
    for (const child of node.children ?? []) go(child, world, depth + 1);
  };
  rootIndices.forEach((index) => go(index, [0, 0, 0], 0));
}

const isIdentityMatrix = (m) =>
  Array.isArray(m) && m.length === 16 && m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < EPS);

// ---------------------------------------------------------------------------
// GLB content against the standards

export function validateGlb(gltf, bin, meta, options = {}) {
  const errors = [];
  const warnings = [];
  const id = options.id ?? meta?.id;
  const category = options.category ?? meta?.category;
  const limits = { ...LIMITS, ...options.limits };
  const voxel = limits.voxelSizeM;

  if (!gltf || typeof gltf !== "object") {
    return { errors: ["GLB JSON is empty"], warnings, stats: null };
  }
  if (!String(gltf.asset?.version ?? "").startsWith("2")) {
    errors.push("asset.version: expected glTF 2.x");
  }

  const compression = (gltf.extensionsRequired ?? []).filter((name) =>
    /draco|meshopt|quantiz/i.test(name)
  );
  if (compression.length > 0) {
    errors.push(`compressed geometry (${compression.join(", ")}) is not supported; export without compression`);
  }

  // Scene root: one node named after the asset id.
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const roots = Array.isArray(scene?.nodes) ? scene.nodes : [];
  if (roots.length !== 1) {
    errors.push(`scene: expected exactly 1 root node named "${id}", found ${roots.length}`);
  } else if (gltf.nodes?.[roots[0]]?.name !== id) {
    errors.push(`root node: named "${gltf.nodes?.[roots[0]]?.name}", expected "${id}"`);
  }

  let triangles = 0;
  const usedMaterials = new Set();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let haveBounds = false;
  let offGrid = 0;
  const unreadable = [];

  walkNodes(gltf, roots, (node, index, world, depth) => {
    const label = `node ${index} "${node.name ?? ""}"`;

    if (!isNonEmptyString(node.name)) {
      errors.push(`${label}: has no name`);
    } else if (DEFAULT_NAME.test(node.name)) {
      errors.push(`${label}: still has a Blender default name`);
    } else if (depth > 0 && id && node.name !== id && !node.name.startsWith(`${id}_`)) {
      warnings.push(`${label}: name should be ${id}_<part>`);
    }

    if (node.matrix !== undefined && !isIdentityMatrix(node.matrix)) {
      errors.push(`${label}: uses a matrix; apply scale and rotation before export`);
    }
    if (Array.isArray(node.scale) && node.scale.some((s) => Math.abs(s - 1) > EPS)) {
      errors.push(`${label}: scale is ${node.scale.map(round).join(", ")}, expected 1, 1, 1 (apply scale)`);
    }
    if (Array.isArray(node.rotation)) {
      const [x, y, z, w] = node.rotation;
      if ([x, y, z].some((v) => Math.abs(v) > EPS) || Math.abs(Math.abs(w) - 1) > EPS) {
        errors.push(`${label}: has a rotation; apply rotation before export`);
      }
    }
    if (depth === 0 && world.some((v) => Math.abs(v) > EPS)) {
      errors.push(`root node: not at world origin (${world.map(round).join(", ")})`);
    }

    if (node.mesh === undefined) return;
    const mesh = gltf.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives ?? []) {
      const mode = primitive.mode ?? 4;
      if (mode < 4) {
        errors.push(`${label}: mesh has points or lines; only triangle meshes are allowed`);
        continue;
      }
      triangles += primitiveTriangles(gltf, primitive) ?? 0;
      if (primitive.material !== undefined) usedMaterials.add(primitive.material);

      const accessorIndex = primitive.attributes?.POSITION;
      const accessor = gltf.accessors?.[accessorIndex];
      const positions = readPositions(gltf, bin, accessorIndex);
      const hasRange = Array.isArray(accessor?.min) && Array.isArray(accessor?.max)
        && accessor.min.length === 3 && accessor.max.length === 3;

      if (hasRange) {
        for (let k = 0; k < 3; k += 1) {
          min[k] = Math.min(min[k], accessor.min[k] + world[k]);
          max[k] = Math.max(max[k], accessor.max[k] + world[k]);
        }
        haveBounds = true;
      } else if (positions) {
        for (let i = 0; i < positions.length; i += 3) {
          for (let k = 0; k < 3; k += 1) {
            min[k] = Math.min(min[k], positions[i + k] + world[k]);
            max[k] = Math.max(max[k], positions[i + k] + world[k]);
          }
        }
        haveBounds = true;
      }

      if (positions) {
        for (let i = 0; i < positions.length; i += 3) {
          const off = [0, 1, 2].some((k) => {
            const v = (positions[i + k] + world[k]) / voxel;
            return Math.abs(v - Math.round(v)) * voxel > limits.gridToleranceM;
          });
          if (off) offGrid += 1;
        }
      } else if (!hasRange) {
        unreadable.push(label);
      }
    }
  });

  unreadable.forEach((label) => warnings.push(`${label}: positions could not be read, size and grid not checked`));
  if (offGrid > 0) {
    warnings.push(`${offGrid} vertices are not on the ${voxel} m voxel grid`);
  }

  // Triangle budget.
  const budget = limits.maxTriangles[category];
  if (budget !== undefined && triangles > budget) {
    errors.push(`${triangles} triangles is over the ${category} budget of ${budget}`);
  }
  if (meta && Number.isInteger(meta.triangles) && meta.triangles !== triangles) {
    warnings.push(`metadata says ${meta.triangles} triangles, the GLB has ${triangles}`);
  }

  // Materials.
  const materials = gltf.materials ?? [];
  if (materials.length > limits.maxMaterials) {
    errors.push(`${materials.length} materials is over the limit of ${limits.maxMaterials}`);
  }
  const allowedImages = Array.isArray(meta?.textures) ? meta.textures.length : 0;
  const imageCount = (gltf.images ?? []).length;
  if (imageCount > allowedImages) {
    errors.push(`${imageCount} embedded images but metadata lists ${allowedImages} textures; flat colors only by default`);
  }

  materials.forEach((material, index) => {
    const label = `material ${index} "${material.name ?? ""}"`;
    if (!isNonEmptyString(material.name) || !material.name.startsWith("mat_")) {
      errors.push(`${label}: name must start with mat_`);
    }
    const pbr = material.pbrMetallicRoughness ?? {};
    const hasTexture = TEXTURE_SLOTS.some((slot) => pbr[slot]) || MATERIAL_TEXTURE_SLOTS.some((slot) => material[slot]);
    if (hasTexture && allowedImages === 0) {
      errors.push(`${label}: uses a texture but metadata lists none`);
    }
    if (pbr.metallicFactor === undefined) {
      warnings.push(`${label}: metallicFactor not set (glTF default is 1, standards want 0)`);
    } else if (pbr.metallicFactor > 0) {
      warnings.push(`${label}: metallicFactor is ${pbr.metallicFactor}, standards want 0`);
    }
    if (!usedMaterials.has(index)) warnings.push(`${label}: not used by any mesh`);
  });

  if (meta && Array.isArray(meta.materials)) {
    const inFile = new Set(materials.map((m) => m.name));
    const inMeta = new Set(meta.materials);
    const differs = inFile.size !== inMeta.size || [...inFile].some((name) => !inMeta.has(name));
    if (differs) warnings.push("metadata materials do not match the materials in the GLB");
  }

  // Size and origin (glTF is Y-up: x width, y height, z depth).
  let bounds = null;
  if (haveBounds) {
    const size = [0, 1, 2].map((k) => max[k] - min[k]);
    bounds = { min: min.map(round), max: max.map(round), size: size.map(round) };

    const tol = limits.toleranceM;
    const rule = meta?.originRule;
    const centerX = (min[0] + max[0]) / 2;
    const centerZ = (min[2] + max[2]) / 2;
    if (rule === "bottom-center") {
      if (Math.abs(min[1]) > tol) {
        errors.push(`lowest point is at y=${round(min[1])} m, expected 0 (origin rule bottom-center)`);
      }
      if (Math.abs(centerX) > tol || Math.abs(centerZ) > tol) {
        errors.push(`model is not centered over the origin (x=${round(centerX)}, z=${round(centerZ)}; origin rule bottom-center)`);
      }
    } else if (rule === "center") {
      const centerY = (min[1] + max[1]) / 2;
      if ([centerX, centerY, centerZ].some((v) => Math.abs(v) > tol)) {
        warnings.push(`model center is at ${[centerX, centerY, centerZ].map(round).join(", ")}, expected near 0 (origin rule center)`);
      }
    }

    const declared = meta?.boundsM;
    if (declared && ["x", "y", "z"].every((axis) => isNumber(declared[axis]))) {
      // Metadata uses Blender axes: x width, y depth, z height.
      const actual = { x: size[0], y: size[2], z: size[1] };
      const off = ["x", "y", "z"].filter((axis) => Math.abs(actual[axis] - declared[axis]) > tol);
      if (off.length > 0) {
        warnings.push(
          `metadata boundsM differs from the GLB on ${off.join(", ")} ` +
            `(GLB: x ${round(actual.x)}, y ${round(actual.y)}, z ${round(actual.z)} m)`
        );
      }
    }
  }

  return {
    errors,
    warnings,
    stats: { triangles, materials: materials.map((m) => m.name), images: imageCount, bounds, offGrid }
  };
}
