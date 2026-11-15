import { createServer } from "node:http";
import { config } from "./config.js";

const { host: HOST, port: PORT } = config;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid TCP port between 1 and 65535.");
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      ok: true,
      name: "WOBBLE ID",
      version: "0.1.0",
      stage: "foundation"
    }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: false, error: "Not found" }));
});

server.listen(PORT, HOST, () => {
  console.log(`WOBBLE ID foundation server listening at http://${HOST}:${PORT}`);
});
