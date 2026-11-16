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
- **Billing (observed 2026-11-15):** prompt and completion tokens are billed separately, each as max(actual, 1024) multiplied by the model's multiplier. Prompt counts include roughly 350 tokens that are not part of our messages. Short requests are therefore not cheaper; prefer fewer, richer requests.
- **Default model:** `deepseek-v4-pro` (cheapest and fastest of the four models tested with the same video-brief prompt).

## AI Director (Phase 2)

- **Brief format:** versioned JSON, defined and validated in `src/brief.js` (pure functions, no network or filesystem). Field reference in `docs/BRIEF_FORMAT.md`.
- **Director:** `src/director.js` builds the prompt (Director v2.1), makes one `chat()` call and returns the parsed brief with its validation result.
- **CLI:** `npm run brief -- "topic"` is a dry run; add `--run` to spend tokens. The result is saved to `output/briefs/` (git-ignored) as a `draft` for manual review. A reply without usable JSON is saved as `.raw.txt`.
- **Review gate:** `npm run brief:show` prints a saved brief and `npm run brief:approve` marks it `approved` after validating it again (`src/brief-files.js` only touches files inside `output/briefs/`). Later phases accept only approved briefs.
- **Validation:** structural problems are errors (the file is marked `invalid` and the command exits with code 1); style problems are warnings for the reviewer. The model is not retried automatically, because every request is billed at least 1024 prompt and 1024 completion tokens.
- **Word budget:** `max_tokens` is not honoured by the gateway, so the length target (90 to 110 spoken words) is enforced by the prompt and checked by the validator.
- **Tests:** `npm test` runs the offline tests in `test/` (no network, no tokens).

## Voxel asset pipeline (Phase 3)

- **Standards:** naming, folders, scale, origin, orientation, and materials are defined in `docs/ASSET_STANDARDS.md`.
- **Link to briefs:** the asset ids in a brief use the same `snake_case` rule (`ASSET_ID` in `src/brief.js`) and are the keys of the asset folders under `assets/`.
- **Validation:** `src/asset.js` (pure functions: metadata check, GLB parser, GLB content check against the standards) and `src/asset-files.js` (finding asset folders, reading files, coverage of a brief's asset ids). The GLB is parsed directly, with no dependencies.
- **CLI:** `npm run asset:check -- <asset_id> | --all | --brief [file]`. Errors give exit code 1.
- **Export:** `scripts/blender/export_asset.py` runs inside Blender (`blender -b file.blend --python ... -- <asset_id>`). It has not been run against real Blender yet.
- **Not implemented yet:** palette check, front-direction check, and asset lookup inside the production pipeline (Phase 4).
