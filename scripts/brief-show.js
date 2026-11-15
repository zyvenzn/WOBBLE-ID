import path from "node:path";
import { BriefError, validateBrief } from "../src/brief.js";
import { readRecord, resolveBriefPath } from "../src/brief-files.js";

// Prints a saved brief in a readable form. Free: no network, no tokens.
//
// Usage:
//   npm run brief:show                      newest brief
//   npm run brief:show -- <file name>       a specific brief in output/briefs

async function main() {
  const file = await resolveBriefPath(process.argv[2]);
  const record = await readRecord(file);
  const { brief } = record;

  // Always re-check, so a hand-edited file shows its real state.
  const validation = validateBrief(brief);
  const { scenes, totalSec, words } = validation.stats;

  console.log(`file: ${path.basename(file)}`);
  console.log(
    `status: ${record.status ?? "(none)"} | model: ${record.model ?? "?"} | ` +
      `${scenes} scenes, ${totalSec}s, ${words} words`
  );
  console.log(`\n${brief.title ?? "(no title)"}`);
  console.log(`hook: ${brief.hook ?? "(none)"}`);

  (Array.isArray(brief.scenes) ? brief.scenes : []).forEach((scene) => {
    console.log(`\n#${scene?.id} (${scene?.durationSec}s) ${scene?.narration ?? ""}`);
    console.log(`  > ${scene?.visual ?? ""}`);
    console.log(`  [${Array.isArray(scene?.assets) ? scene.assets.join(", ") : ""}]`);
  });

  console.log(`\nCTA: ${brief.cta ?? "(none)"}`);
  console.log(`\nvalidation: ${validation.ok ? "ok" : "INVALID"}`);
  validation.errors.forEach((message) => console.log(`  error: ${message}`));
  validation.warnings.forEach((message) => console.log(`  warning: ${message}`));

  if (record.status === "approved") {
    console.log(`approved at: ${record.approvedAt ?? "?"}`);
  } else if (validation.ok) {
    console.log(`\nTo approve: npm run brief:approve -- ${path.basename(file)}`);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof BriefError) {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
