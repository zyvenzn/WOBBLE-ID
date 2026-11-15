import { mkdir, writeFile } from "node:fs/promises";
import { config } from "../src/config.js";
import { RelinkError } from "../src/relink.js";
import { BriefError } from "../src/brief.js";
import {
  buildMessages,
  DIRECTOR_VERSION,
  estimatePromptTokens,
  generateBrief
} from "../src/director.js";

// Generates one video brief for a topic, validates it and saves it for manual review.
// Dry run by default: add --run to actually spend tokens.
//
// Usage:
//   npm run brief -- "Mengapa langit berwarna biru?"
//   npm run brief -- "Mengapa langit berwarna biru?" --run
//   npm run brief -- "Mengapa langit berwarna biru?" --run --model kimi-k2.7-code

const VALUE_FLAGS = new Set(["--model", "--max-tokens"]);

function parseArgs(argv) {
  const flags = new Map();
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      flags.set(arg, VALUE_FLAGS.has(arg) ? argv[++i] : true);
    } else {
      positional.push(arg);
    }
  }

  return { flags, topic: positional.join(" ").trim() };
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "brief"
  );
}

function printUsage(usage = {}) {
  const reasoning = usage.completion_tokens_details?.reasoning_tokens ?? 0;
  console.log(
    `tokens: prompt ${usage.prompt_tokens} + completion ${usage.completion_tokens}` +
      ` (reasoning ${reasoning}) = ${usage.total_tokens}`
  );
}

async function main() {
  const { flags, topic } = parseArgs(process.argv.slice(2));

  if (!topic) {
    console.error('Usage: npm run brief -- "topic" [--run] [--model <id>] [--max-tokens <n>]');
    process.exitCode = 1;
    return;
  }

  const model = flags.get("--model") || config.relink.model;
  const maxTokens = Number.parseInt(flags.get("--max-tokens") || "", 10) || 3000;
  const messages = buildMessages(topic);

  if (!flags.has("--run")) {
    console.log("Dry run. One request would be sent:");
    console.log(`- topic: ${topic}`);
    console.log(`- model: ${model || "(RELINK_MODEL is not set)"}`);
    console.log(`- prompt: about ${estimatePromptTokens(messages)} tokens of our own text`);
    console.log("This spends tokens. Add --run to start.");
    return;
  }

  console.log(`Generating brief with ${model} ...`);
  const startedAt = Date.now();
  const result = await generateBrief(topic, { model, maxTokens });
  const seconds = (Date.now() - startedAt) / 1000;

  console.log(`time: ${seconds.toFixed(1)}s | finish: ${result.finishReason}`);
  printUsage(result.usage);

  await mkdir("output/briefs", { recursive: true });
  const base = `output/briefs/${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(topic)}`;

  if (!result.brief) {
    await writeFile(`${base}.raw.txt`, result.raw ?? "");
    console.log(`brief: INVALID - ${result.validation.errors.join("; ")}`);
    console.log(`Saved raw reply: ${base}.raw.txt`);
    process.exitCode = 1;
    return;
  }

  const { validation } = result;
  const record = {
    status: validation.ok ? "draft" : "invalid",
    directorVersion: DIRECTOR_VERSION,
    createdAt: new Date().toISOString(),
    model: result.model || model,
    usage: result.usage,
    validation,
    brief: result.brief
  };
  await writeFile(`${base}.json`, `${JSON.stringify(record, null, 2)}\n`);

  const { scenes, totalSec, words } = validation.stats;
  console.log(`brief: ${validation.ok ? "valid" : "INVALID"} | ${scenes} scenes, ${totalSec}s, ${words} words`);
  console.log(`title: ${result.brief.title ?? "(none)"}`);
  validation.errors.forEach((message) => console.log(`  error: ${message}`));
  validation.warnings.forEach((message) => console.log(`  warning: ${message}`));
  console.log(`Saved: ${base}.json`);
  console.log("Review it by hand before using it. Nothing was sent to production.");

  if (!validation.ok) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  if (error instanceof RelinkError || error instanceof BriefError) {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
