import { chat, listModels, RelinkError } from "../src/relink.js";

// Default run only lists models (no tokens spent).
// Pass --chat to also send one tiny chat request (spends a few tokens).
const includeChat = process.argv.includes("--chat");

try {
  const models = await listModels();
  const active = models.filter((model) => model.enabled && model.available);

  console.log(`Models: ${active.length} active of ${models.length}`);
  console.log(active.map((model) => model.id).join("\n"));

  if (includeChat) {
    const result = await chat(
      [{ role: "user", content: "Balas satu kata saja: halo" }],
      { maxTokens: 20 }
    );
    console.log(`\nModel: ${result.model}`);
    console.log(`Reply: ${result.content}`);
    console.log(`Usage: ${JSON.stringify(result.usage)}`);
  } else {
    console.log("\nChat test skipped because it spends tokens. Run with --chat to include it.");
  }
} catch (error) {
  if (error instanceof RelinkError) {
    console.error(`Re:Link error: ${error.message}`);
    if (error.status) {
      console.error(`HTTP status: ${error.status}`);
    }
    process.exitCode = 1;
  } else {
    throw error;
  }
}
