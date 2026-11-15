import { config } from "./config.js";

// Adapter for Re:Link Gateway (OpenAI-compatible API, Bearer authentication).
// Verified endpoints: GET /models and POST /chat/completions.

export class RelinkError extends Error {
  constructor(message, { status, body, cause } = {}) {
    super(message, { cause });
    this.name = "RelinkError";
    this.status = status;
    this.body = body;
  }
}

function assertConfigured(...keys) {
  const missing = keys.filter((key) => !config.relink[key]);
  if (missing.length > 0) {
    throw new RelinkError(
      `Missing Re:Link settings: ${missing.join(", ")}. Check your .env file.`
    );
  }
}

async function request(path, { method = "GET", body } = {}) {
  assertConfigured("baseUrl", "apiKey");
  const { baseUrl, apiKey, timeoutMs } = config.relink;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...(body ? { "content-type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new RelinkError(`Re:Link returned HTTP ${response.status}`, {
        status: response.status,
        body: text.slice(0, 500)
      });
    }

    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new RelinkError("Re:Link returned invalid JSON", {
        body: text.slice(0, 500),
        cause
      });
    }
  } catch (error) {
    if (error instanceof RelinkError) {
      throw error;
    }
    if (error.name === "AbortError") {
      throw new RelinkError(`Re:Link request timed out after ${timeoutMs} ms`, {
        cause: error
      });
    }
    throw new RelinkError(`Could not reach Re:Link: ${error.message}`, {
      cause: error
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function listModels() {
  const data = await request("/models");
  const models = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : null;

  if (!models) {
    throw new RelinkError("Unexpected Re:Link response shape for /models", {
      body: JSON.stringify(data).slice(0, 500)
    });
  }

  return models;
}

export async function chat(messages, { model, maxTokens, temperature } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new RelinkError("messages must be a non-empty array");
  }

  const selectedModel = model || config.relink.model;
  if (!selectedModel) {
    throw new RelinkError("Missing Re:Link settings: model. Set RELINK_MODEL in .env.");
  }

  const data = await request("/chat/completions", {
    method: "POST",
    body: {
      model: selectedModel,
      messages,
      max_tokens: maxTokens,
      temperature
    }
  });

  const choice = data?.choices?.[0];
  if (!choice?.message) {
    throw new RelinkError("Unexpected Re:Link response shape for /chat/completions", {
      body: JSON.stringify(data).slice(0, 500)
    });
  }

  return {
    content: choice.message.content ?? "",
    finishReason: choice.finish_reason,
    model: data.model,
    usage: data.usage
  };
}
