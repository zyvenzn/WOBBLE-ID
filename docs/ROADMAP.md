# WOBBLE ID — Roadmap

## Phase 0 — Foundation

- [x] Initialize repository documentation.
- [x] Add Node.js project metadata.
- [x] Add a minimal health-check endpoint.
- [x] Run the server locally in Termux and verify `GET /health`.

## Phase 1 — AI provider connection

- [x] Confirm Re:Link base URL, authentication format, and model IDs (OpenAI-compatible, Bearer token; verified with `GET /models` and `POST /chat/completions`).
- [x] Add a provider adapter with timeout and error handling.
- [x] Keep credentials outside Git.
- [x] Run `npm run relink:check -- --chat` in Termux and verify the adapter end to end.
- [x] Compare the dashboard's token usage with the `usage` field in responses before budgeting the quota.
- [x] Choose the default model for the AI Director by testing several active models with the same prompt.

## Phase 2 — AI Director

- [x] Define a versioned video brief format (`docs/BRIEF_FORMAT.md`, `src/brief.js`).
- [ ] Generate structured scenes, narration drafts, and asset lists (`npm run brief`; code and offline tests are in, still to be verified against the live gateway).
- [ ] Add human review before production jobs begin.

## Phase 3 — Voxel asset pipeline

- [ ] Define asset naming and folder conventions.
- [ ] Define Blender scene, scale, origin, and material standards.
- [ ] Export and validate GLB/glTF assets.

## Phase 4 — Animation and media

- [ ] Define reusable character rigs and animation clips.
- [ ] Integrate narration/audio generation.
- [ ] Assemble scenes and audio with FFmpeg.

## Phase 5 — Render worker and orchestration

- [ ] Add a desktop or remote Blender worker.
- [ ] Track queued, running, completed, and failed jobs.
- [ ] Add retries, logs, and approval gates.

## Release principle

Ship one working vertical slice before introducing multiple autonomous agents. Split specialist roles into separate agents only when their interfaces and responsibilities are stable.
