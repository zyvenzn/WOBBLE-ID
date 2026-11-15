import { writeFile } from "node:fs/promises";
import path from "node:path";
import { BriefError, validateBrief } from "../src/brief.js";
import { readRecord, resolveBriefPath } from "../src/brief-files.js";

// Marks a saved brief as approved (the human review gate before production).
// The brief is validated again first, so a hand-edited file cannot slip through.
// Free: no network, no tokens.
//
// Usage:
//   npm run brief:approve -- <file name>
//   npm run brief:approve -- --latest

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error("Usage: npm run brief:approve -- <file name> | --latest");
    console.error("Look at it first with: npm run brief:show");
    process.exitCode = 1;
    return;
  }

  const file = await resolveBriefPath(arg === "--latest" ? undefined : arg);
  const record = await readRecord(file);
  const name = path.basename(file);

  if (record.status === "approved") {
    console.log(`${name} is already approved (${record.approvedAt ?? "unknown time"}).`);
    return;
  }

  const validation = validateBrief(record.brief);
  if (!validation.ok) {
    console.error(`Not approved: ${name} does not pass validation.`);
    validation.errors.forEach((message) => console.error(`  error: ${message}`));
    process.exitCode = 1;
    return;
  }

  record.status = "approved";
  record.approvedAt = new Date().toISOString();
  record.validation = validation;
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`Approved: ${name}`);
  validation.warnings.forEach((message) => console.log(`  warning (accepted): ${message}`));
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
