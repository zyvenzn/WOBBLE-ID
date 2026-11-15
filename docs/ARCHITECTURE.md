# WOBBLE ID — Initial Architecture

## Design principle

Keep the control plane separate from the media execution layer. The first release should be small, testable, and compatible with an Android-first workflow.

## Components

- **Control plane:** Node.js application for project state, briefs, orchestration, and integrations.
- **Android workstation:** Termux is the lightweight command center for editing and running JavaScript tools.
- **AI provider adapter:** A replaceable adapter for Re:Link Gateway. Do not assume its API URL, authentication format, or model identifiers; verify these in the provider dashboard before implementation.
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

## Next integration boundary

Implement the Re:Link adapter only after confirming the gateway's exact base URL, request format, authentication header, and available model IDs. The gateway supplies language-model access; it does not itself create Blender assets or render videos.
