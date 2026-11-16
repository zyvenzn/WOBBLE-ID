import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ASSET_ID } from "./brief.js";
import { AssetError, CATEGORIES, STATUSES, parseGlb, validateGlb, validateMetadata } from "./asset.js";

// Locating and checking asset folders: assets/<category>/<asset_id>/.
// Ids are checked against ASSET_ID before they are joined into a path.

export const ASSETS_DIR = "assets";

async function isDirectory(dir) {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

export async function findAsset(id, root = ASSETS_DIR) {
  if (typeof id !== "string" || !ASSET_ID.test(id)) {
    throw new AssetError(`"${id}" is not a valid asset id (lowercase snake_case)`);
  }
  for (const category of CATEGORIES) {
    const dir = path.join(root, category, id);
    if (await isDirectory(dir)) return { id, category, dir };
  }
  return null;
}

export async function listAssets(root = ASSETS_DIR) {
  const found = [];
  for (const category of CATEGORIES) {
    let names = [];
    try {
      names = await readdir(path.join(root, category));
    } catch {
      continue; // category folder does not exist yet
    }
    for (const id of names.sort()) {
      const dir = path.join(root, category, id);
      if (ASSET_ID.test(id) && (await isDirectory(dir))) found.push({ id, category, dir });
    }
  }
  return found;
}

async function readIfPresent(file, encoding) {
  try {
    return await readFile(file, encoding);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// Full check of one asset: metadata file, then the GLB if there is one.
export async function checkAsset({ id, category, dir }) {
  const errors = [];
  const warnings = [];
  let stats = null;
  let meta = null;

  const metaText = await readIfPresent(path.join(dir, `${id}.json`), "utf8");
  if (metaText === null) {
    errors.push(`${id}.json is missing`);
  } else {
    try {
      meta = JSON.parse(metaText);
    } catch (error) {
      errors.push(`${id}.json is not valid JSON: ${error.message}`);
    }
  }

  if (meta) {
    const result = validateMetadata(meta, { id, category });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  const glb = await readIfPresent(path.join(dir, `${id}.glb`));
  if (glb === null) {
    if (meta?.status === "draft") {
      warnings.push(`${id}.glb is missing (allowed while status is draft)`);
    } else {
      errors.push(`${id}.glb is missing`);
    }
  } else {
    try {
      const { json, bin } = parseGlb(glb);
      const result = validateGlb(json, bin, meta, { id, category });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
      stats = result.stats;
    } catch (error) {
      if (!(error instanceof AssetError)) throw error;
      errors.push(error.message);
    }
  }

  return { id, category, status: meta?.status ?? null, errors, warnings, stats };
}

// For each asset id (from an approved brief): what is there to use?
// States: approved, review, draft, no-glb (approved on paper but no file),
// unreadable (metadata broken), missing (still to be built), invalid-id.
export async function assetCoverage(ids, root = ASSETS_DIR) {
  const result = [];
  for (const id of [...new Set(ids)]) {
    if (typeof id !== "string" || !ASSET_ID.test(id)) {
      result.push({ id: String(id), state: "invalid-id" });
      continue;
    }
    const asset = await findAsset(id, root);
    if (!asset) {
      result.push({ id, state: "missing" });
      continue;
    }

    let meta = null;
    try {
      meta = JSON.parse(await readFile(path.join(asset.dir, `${id}.json`), "utf8"));
    } catch {
      // handled below as unreadable
    }
    if (!meta || !STATUSES.includes(meta.status)) {
      result.push({ id, category: asset.category, state: "unreadable" });
      continue;
    }

    const hasGlb = (await readIfPresent(path.join(asset.dir, `${id}.glb`))) !== null;
    const state = meta.status === "approved" && !hasGlb ? "no-glb" : meta.status;
    result.push({ id, category: asset.category, state });
  }
  return result;
}
