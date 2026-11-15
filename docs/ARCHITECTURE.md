# WOBBLE ID — Initial Architecture

## Design principle

Keep the control plane separate from the media execution layer. The first release should be small, testable, and compatible with an Android-first workflow.

## Components

- **Control plane:** Node.js application for project state, briefs, orchestration, and integrations.
- **Android workstation:** Termux is the lightweight command center for editing and running JavaScript tools.
- **AI provider adapter:** A replaceable adapter for Re:Link Gateway (`src/relink.js`).
- **3D pipeline:** Blender creates and animates assets; GLB/glTF is the interchange format for reusable 3D assets.
- **Media pipeline:** Audio generation and FFmpeg-based assembly are separate tools invoked by pipeline jobs.
- **Render worker:** Desktop or remote compute handles Blender rendering and other resource-intensive work.

## Initial runtime

The first Node.js server exposes only:

- `GET /health` — process health and version information.

## Safety and reliability

- Keep API keys in local environment variables; never commit real secrets.
- Validate file paths before any filesystem operation.
- Require explicit approval before destructive actions or paid provider calls.
- Track job status, inputs, outputs, and errors as the pipeline grows.
- Preserve existing WOBBLE ID project features when integrating this foundation.

## Re:Link provider adapter

- **API style:** OpenAI-compatible, authenticated with `Authorization: Bearer <key>`.
- **Endpoints in use:** `GET /models` and `POST /chat/completions` (base URL set by `RELINK_BASE_URL`).
- **Configuration:** `RELINK_BASE_URL`, `RELINK_API_KEY`, `RELINK_MODEL`, and `RELINK_TIMEOUT_MS`, loaded from `.env` by `src/config.js`.
- **Errors:** every failure (missing settings, HTTP error, timeout, network error, unexpected response) surfaces as a `RelinkError`; the API key is never included in messages.
- **Model availability** changes over time. Run `npm run relink:check` to see which models are currently enabled.
- **Token accounting:** the dashboard may count more tokens than the `usage` field of a response (observed on a single small request). Compare both before budgeting the quota.
- **Scope:** the gateway supplies language-model access only; it does not create Blender assets or render videos.
- **Not implemented yet:** retries and request queuing (see Phase 5 in the roadmap).
