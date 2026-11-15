// Load a local .env file when present. Real environment variables win over .env.
// process.loadEnvFile requires Node.js >= 20.12.
try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

export const config = {
  host: process.env.HOST || "127.0.0.1",
  port: Number.parseInt(process.env.PORT || "8787", 10),
  relink: {
    baseUrl: trimTrailingSlash(process.env.RELINK_BASE_URL || ""),
    apiKey: process.env.RELINK_API_KEY || "",
    model: process.env.RELINK_MODEL || "",
    timeoutMs: Number.parseInt(process.env.RELINK_TIMEOUT_MS || "", 10) || 60000
  }
};
