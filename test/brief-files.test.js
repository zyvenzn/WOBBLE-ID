import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BriefError } from "../src/brief.js";
import { readRecord, resolveBriefPath } from "../src/brief-files.js";

async function makeDir() {
  const root = await mkdtemp(path.join(os.tmpdir(), "wobble-briefs-"));
  const dir = path.join(root, "briefs");
  await mkdir(dir);
  return { root, dir };
}

test("resolveBriefPath returns the newest .json by timestamped name", async () => {
  const { root, dir } = await makeDir();
  try {
    await writeFile(path.join(dir, "2026-11-15T08-00-00-000Z-a.json"), "{}");
    await writeFile(path.join(dir, "2026-11-15T09-00-00-000Z-b.json"), "{}");
    await writeFile(path.join(dir, "2026-11-15T10-00-00-000Z-c.raw.txt"), "x");
    const latest = await resolveBriefPath(undefined, dir);
    assert.equal(path.basename(latest), "2026-11-15T09-00-00-000Z-b.json");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveBriefPath finds a file by name and refuses paths outside the folder", async () => {
  const { root, dir } = await makeDir();
  try {
    await writeFile(path.join(dir, "one.json"), "{}");
    await writeFile(path.join(root, "outside.json"), "{}");

    assert.equal(path.basename(await resolveBriefPath("one.json", dir)), "one.json");
    await assert.rejects(resolveBriefPath("missing.json", dir), BriefError);
    await assert.rejects(resolveBriefPath("../outside.json", dir), BriefError);
    await assert.rejects(resolveBriefPath(path.join(root, "outside.json"), dir), BriefError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveBriefPath explains an empty or missing folder", async () => {
  const { root, dir } = await makeDir();
  try {
    await assert.rejects(resolveBriefPath(undefined, dir), /No briefs/);
    await assert.rejects(resolveBriefPath(undefined, path.join(root, "nope")), /No briefs/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readRecord needs valid JSON with a brief object", async () => {
  const { root, dir } = await makeDir();
  try {
    const good = path.join(dir, "good.json");
    const noBrief = path.join(dir, "nobrief.json");
    const broken = path.join(dir, "broken.json");
    await writeFile(good, JSON.stringify({ status: "draft", brief: { title: "x" } }));
    await writeFile(noBrief, JSON.stringify({ status: "draft" }));
    await writeFile(broken, "{rusak");

    assert.equal((await readRecord(good)).brief.title, "x");
    await assert.rejects(readRecord(noBrief), BriefError);
    await assert.rejects(readRecord(broken), BriefError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
