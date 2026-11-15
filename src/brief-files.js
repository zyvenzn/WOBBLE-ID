import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { BriefError } from "./brief.js";

// Locating and reading saved brief records (output/briefs/*.json).
// Only files inside the briefs folder are ever touched.

export const BRIEFS_DIR = "output/briefs";

// With a name or path: that file, if it is a .json inside the briefs folder.
// Without one: the newest brief (file names start with a timestamp).
export async function resolveBriefPath(arg, dir = BRIEFS_DIR) {
  const root = path.resolve(dir);

  if (arg) {
    for (const candidate of [path.resolve(arg), path.resolve(root, arg)]) {
      if (!candidate.startsWith(root + path.sep) || !candidate.endsWith(".json")) continue;
      try {
        await access(candidate);
        return candidate;
      } catch {
        // try the next candidate
      }
    }
    throw new BriefError(`Brief not found in ${dir}: ${arg}`);
  }

  let names = [];
  try {
    names = await readdir(root);
  } catch {
    // folder does not exist yet
  }

  const latest = names.filter((name) => name.endsWith(".json")).sort().pop();
  if (!latest) {
    throw new BriefError(`No briefs in ${dir}. Run npm run brief first.`);
  }
  return path.join(root, latest);
}

export async function readRecord(file) {
  let record;
  try {
    record = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new BriefError(`Could not read ${path.basename(file)}: ${error.message}`);
  }

  if (!record || typeof record !== "object" || typeof record.brief !== "object" || !record.brief) {
    throw new BriefError(`${path.basename(file)} is not a saved brief (no "brief" object)`);
  }
  return record;
}
