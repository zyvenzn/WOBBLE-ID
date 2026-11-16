import { AssetError } from "../src/asset.js";
import { ASSETS_DIR, assetCoverage, checkAsset, findAsset, listAssets } from "../src/asset-files.js";
import { BriefError } from "../src/brief.js";
import { readRecord, resolveBriefPath } from "../src/brief-files.js";

// Checks voxel assets against docs/ASSET_STANDARDS.md. Free: no network, no tokens.
//
// Usage:
//   npm run asset:check -- <asset_id>        check one asset
//   npm run asset:check -- --all             check every asset in assets/
//   npm run asset:check -- --brief [file]    which assets a brief can use and which are still to build
//                                            (default: the newest brief in output/briefs/)
// Exit code 1 when an asset has errors. Warnings do not fail the run.

const USAGE = "Usage: npm run asset:check -- <asset_id> | --all | --brief [file]";

function printResult(result) {
  const ok = result.errors.length === 0;
  const status = result.status ? `, ${result.status}` : "";
  console.log(`${ok ? "OK  " : "FAIL"} ${result.id} (${result.category}${status})`);
  if (result.stats) {
    const { triangles, materials, bounds } = result.stats;
    const size = bounds ? `, ${bounds.size[0]} x ${bounds.size[2]} x ${bounds.size[1]} m (w x d x h)` : "";
    console.log(`     ${triangles} triangles, ${materials.length} materials${size}`);
  }
  result.errors.forEach((message) => console.log(`     error: ${message}`));
  result.warnings.forEach((message) => console.log(`     warning: ${message}`));
}

async function checkMany(assets) {
  let failed = 0;
  for (const asset of assets) {
    const result = await checkAsset(asset);
    printResult(result);
    if (result.errors.length > 0) failed += 1;
  }
  console.log(`\n${assets.length - failed} of ${assets.length} assets without errors.`);
  if (failed > 0) process.exitCode = 1;
}

async function briefCoverage(fileArg) {
  const file = await resolveBriefPath(fileArg);
  const record = await readRecord(file);
  const ids = (record.brief.scenes ?? []).flatMap((scene) => (Array.isArray(scene.assets) ? scene.assets : []));
  const rows = await assetCoverage(ids);

  console.log(`Brief: ${file}`);
  console.log(`Brief status: ${record.status ?? "unknown"}\n`);
  rows.forEach((row) => console.log(`  ${row.state.padEnd(10)} ${row.id}${row.category ? ` (${row.category})` : ""}`));

  const ready = rows.filter((row) => row.state === "approved").length;
  const toBuild = rows.filter((row) => row.state === "missing").map((row) => row.id);
  console.log(`\n${ready} of ${rows.length} assets are approved and ready.`);
  if (toBuild.length > 0) console.log(`To build: ${toBuild.join(", ")}`);
}

async function main() {
  const [first, second] = process.argv.slice(2);

  if (!first) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  if (first === "--all") {
    const assets = await listAssets();
    if (assets.length === 0) {
      console.log(`No assets in ${ASSETS_DIR}/ yet.`);
      return;
    }
    await checkMany(assets);
    return;
  }

  if (first === "--brief") {
    await briefCoverage(second && !second.startsWith("--") ? second : undefined);
    return;
  }

  if (first.startsWith("--")) {
    console.error(`Unknown option: ${first}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const asset = await findAsset(first);
  if (!asset) {
    console.error(`Asset "${first}" not found in ${ASSETS_DIR}/{characters,props,environments}/.`);
    process.exitCode = 1;
    return;
  }
  await checkMany([asset]);
}

try {
  await main();
} catch (error) {
  if (error instanceof AssetError || error instanceof BriefError) {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
