# WOBBLE ID — Video Brief Format v1

A brief is one JSON object that describes one video. It is produced by the AI Director (`npm run brief`) and checked by `validateBrief()` in `src/brief.js`. Later phases (assets, animation, assembly) read it as their input.

## Fields

| Field | Type | Rule |
| --- | --- | --- |
| `version` | number | Always `1`. Set by the code, not by the model. |
| `topic` | string | The topic given on the command line. Set by the code. |
| `title` | string | Video title, up to 70 characters (longer is a warning). |
| `hook` | string | Spoken opening line, up to 14 words (more is a warning). Scene 1 does not repeat it. |
| `scenes` | array | 5 to 7 scenes. |
| `cta` | string | One sentence asking for like, comment and subscribe. Only here, never inside a narration. |

### Scene

| Field | Type | Rule |
| --- | --- | --- |
| `id` | number | Sequential from 1. |
| `durationSec` | number | 3 to 12, whole seconds. |
| `narration` | string | Spoken text only. No like/comment/subscribe call. |
| `visual` | string | What the 3D/voxel scene shows: setting, action, camera. When Wobble appears, it names an expression and a movement. |
| `assets` | string[] | 1 to 4 asset ids in `snake_case` (for example `voxel_earth`, `wobble_character`). |

## Limits

- Total duration of all scenes: 40 to 50 seconds (the target is about 45).
- Spoken words (`hook` plus every `narration`): target 90 to 110 (about 2 words per second of scene time). Above 110 or below 85 is a warning, above 125 is an error. Too few words leaves silent gaps in the video.
- At least one scene shows Wobble and at least one asset id starts with `wobble` (otherwise a warning).
- Wobble's design is fixed (purple WOBBLE sweater, black jeans, red sneakers, crown). A `visual` that mentions Wobble together with an extra item such as glasses, hat or jacket gets a warning.

## Example

```json
{
  "version": 1,
  "topic": "Mengapa langit berwarna biru?",
  "title": "Kenapa Langit Biru?",
  "hook": "Langit itu sebenarnya tidak biru, lho!",
  "scenes": [
    {
      "id": 1,
      "durationSec": 7,
      "narration": "Cahaya matahari tampak putih, tapi isinya campuran semua warna pelangi.",
      "visual": "Wobble menatap matahari voxel dengan mata melebar, kamera zoom pelan.",
      "assets": ["voxel_sun", "wobble_character"]
    }
  ],
  "cta": "Kalau suka, like, komen, dan subscribe WOBBLE ID ya!"
}
```

(The example shows one scene only. A valid brief has 5 to 7.)

## Saved file

`npm run brief -- "topic" --run` wraps the brief like this and writes it to `output/briefs/<timestamp>-<slug>.json`:

```json
{
  "status": "draft",
  "directorVersion": 2.1,
  "createdAt": "2026-11-15T07:55:23.419Z",
  "model": "deepseek-v4-pro",
  "usage": {},
  "validation": { "ok": true, "errors": [], "warnings": [], "stats": { "scenes": 6, "totalSec": 45, "words": 68 } },
  "brief": {}
}
```

`status` is `draft` when validation passed and `invalid` when it did not. Nothing marks a brief as approved yet; that is the next roadmap item ("human review before production jobs begin").
