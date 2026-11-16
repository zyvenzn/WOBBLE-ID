# WOBBLE ID

**AI-Powered Cinematic Voxel Animation Production System**

WOBBLE ID is an AI-assisted production platform designed to create cinematic voxel animations through an integrated workflow combining artificial intelligence, 3D asset creation, animation, and video rendering.

## Vision

Make cinematic voxel animation production easier through intelligent automation and modular creative tools.

## Core Technologies

- **Runtime:** Node.js (>= 20.12)
- **Development environment:** Android Termux
- **3D creation:** Blender
- **3D asset format:** GLB / glTF
- **AI provider:** Re:Link Gateway (OpenAI-compatible API)
- **Audio generation:** ElevenLabs
- **Video processing:** FFmpeg

## Core Modules

- AI Director
- Voxel Asset Designer
- Animation Engineer
- Video Producer
- Technical Engineer

## Production Workflow

1. Generate a video concept and storyboard.
2. Design voxel characters and environments.
3. Create and validate 3D assets.
4. Build animation scenes and sequences.
5. Generate narration and audio.
6. Render and assemble the final video.

## Architecture

WOBBLE ID uses a hybrid architecture:

- Android Termux acts as the project control center.
- JavaScript / Node.js handles orchestration and integrations.
- Blender handles 3D asset creation and animation.
- External rendering workers handle computationally intensive tasks.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ROADMAP.md](docs/ROADMAP.md) for details.

## Quick Start

```bash
cp .env.example .env        # then fill in RELINK_API_KEY
npm run relink:check        # list active models (spends no tokens)
npm run relink:check -- --chat   # optional: one tiny chat request
npm start                   # health check at http://127.0.0.1:8787/health
npm test                    # offline tests (no network, no tokens)
npm run asset:check -- --all     # check voxel assets against docs/ASSET_STANDARDS.md
npm run asset:check -- --brief   # which assets the newest brief can use / still needs
```

The AI Director commands (`npm run brief`, `brief:show`, `brief:approve`) are described in [docs/BRIEF_FORMAT.md](docs/BRIEF_FORMAT.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Never commit `.env` or real API keys.

## Development Status

Current stage: **Phase 3 — Voxel asset pipeline** (standards and checker done; first real asset next). See [docs/ROADMAP.md](docs/ROADMAP.md). This project is under active development.

---

*Built for creative automation. Powered by AI. Designed for cinematic voxel storytelling.*
