import { mkdir, writeFile } from "node:fs/promises";
import { chat, listModels, RelinkError } from "../src/relink.js";

// Sends the same video-brief prompt to several models, one request each, and
// reports time, token usage (including reasoning tokens) and JSON validity.
// Dry run by default: add --run to actually spend tokens.
//
// Usage:
//   npm run relink:compare
//   npm run relink:compare -- --run
//   npm run relink:compare -- --run --models glm-5.3,kimi-k2.7-code --topic "Mengapa langit biru?"

const DEFAULT_MODELS = ["deepseek-v4-pro", "glm-5.3", "kimi-k2.7-code", "mimo-v2.5-pro"];
const DEFAULT_TOPIC = "Bagaimana jika Bumi tiba-tiba berhenti berputar selama 5 detik?";

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const shouldRun = process.argv.includes("--run");
const models = (getArg("--models") || DEFAULT_MODELS.join(","))
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const topic = getArg("--topic") || DEFAULT_TOPIC;
const maxTokens = Number.parseInt(getArg("--max-tokens") || "", 10) || 3000;

function buildMessages(videoTopic) {
  return [
    {
      role: "system",
      content:
        "Kamu adalah AI Director untuk channel YouTube pengetahuan umum bernama WOBBLE ID. " +
        "Balas HANYA dengan JSON valid, tanpa teks lain."
    },
    {
      role: "user",
      content: [
        `Topik: ${videoTopic}`,
        "Buat brief video vertikal 9:16 berdurasi sekitar 45 detik dengan karakter kartun 3D bernama Wobble.",
        'Format JSON: {"title": string, "hook": string, "scenes": [{"id": number, "durationSec": number, "narration": string, "visual": string}], "cta": string}',
        "Buat 5 sampai 7 scene. Narasi dalam bahasa Indonesia yang santai dan faktual. Hindari klaim yang tidak bisa diverifikasi."
      ].join("\n")
    }
  ];
}

function parseBrief(text) {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end <= start) {
    return { ok: false, reason: "no JSON object found" };
  }

  try {
    const brief = JSON.parse(cleaned.slice(start, end + 1));

    if (!Array.isArray(brief.scenes) || brief.scenes.length === 0) {
      return { ok: false, reason: "missing scenes array" };
    }

    const incomplete = brief.scenes.filter((scene) => !scene?.narration || !scene?.visual).length;
    return { ok: true, brief, scenes: brief.scenes.length, incomplete };
  } catch (error) {
    return { ok: false, reason: `invalid JSON (${error.message})` };
  }
}

async function main() {
  const catalog = await listModels();
  const active = new Set(
    catalog.filter((model) => model.enabled && model.available).map((model) => model.id)
  );
  const inactive = models.filter((id) => !active.has(id));

  if (inactive.length > 0) {
    console.error(`Model not active: ${inactive.join(", ")}`);
    console.error("Run npm run relink:check to see the active models.");
    process.exitCode = 1;
    return;
  }

  if (!shouldRun) {
    console.log(`Dry run. ${models.length} requests would be sent, one per model:`);
    models.forEach((id) => console.log(`- ${id}`));
    console.log(`Topic: ${topic}`);
    console.log("This spends tokens. Add --run to start.");
    return;
  }

  const results = [];
  let totalTokens = 0;

  for (const model of models) {
    console.log(`\n== ${model}`);
    const startedAt = Date.now();

    try {
      const result = await chat(buildMessages(topic), { model, maxTokens });
      const seconds = (Date.now() - startedAt) / 1000;
      const usage = result.usage || {};
      const reasoning = usage.completion_tokens_details?.reasoning_tokens ?? 0;
      const parsed = parseBrief(result.content);

      totalTokens += usage.total_tokens || 0;

      console.log(`time: ${seconds.toFixed(1)}s | finish: ${result.finishReason}`);
      console.log(
        `tokens: prompt ${usage.prompt_tokens} + completion ${usage.completion_tokens}` +
          ` (reasoning ${reasoning}) = ${usage.total_tokens}`
      );

      if (parsed.ok) {
        console.log(`json: valid, ${parsed.scenes} scenes, ${parsed.incomplete} incomplete`);
        console.log(`title: ${parsed.brief.title ?? "(none)"}`);
      } else {
        console.log(`json: INVALID - ${parsed.reason}`);
      }

      results.push({
        model,
        seconds,
        finishReason: result.finishReason,
        usage,
        json: parsed.ok
          ? { ok: true, scenes: parsed.scenes, incomplete: parsed.incomplete }
          : { ok: false, reason: parsed.reason },
        content: result.content
      });
    } catch (error) {
      if (!(error instanceof RelinkError)) {
        throw error;
      }
      console.log(`error: ${error.message}`);
      results.push({ model, error: error.message, status: error.status });
    }
  }

  console.log(`\nTotal tokens (usage field): ${totalTokens}`);

  await mkdir("output", { recursive: true });
  const file = `output/compare-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(file, JSON.stringify({ topic, maxTokens, results }, null, 2));

  console.log(`Saved: ${file}`);
  console.log("Compare the total above with the dashboard 'Terpakai' difference.");
}

try {
  await main();
} catch (error) {
  if (error instanceof RelinkError) {
    console.error(`Re:Link error: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
