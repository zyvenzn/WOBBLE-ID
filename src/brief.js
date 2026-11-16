// Video brief format v1 for the WOBBLE ID AI Director.
// Pure functions only: no network and no filesystem. See docs/BRIEF_FORMAT.md.

export const BRIEF_VERSION = 1;

export const LIMITS = Object.freeze({
  minScenes: 5,
  maxScenes: 7,
  minTotalSec: 40,
  maxTotalSec: 50,
  minSceneSec: 3,
  maxSceneSec: 12,
  minWords: 85, // below this: warning (silent gaps in the video)
  targetWords: 110, // above this: warning
  maxWords: 125, // above this: error
  maxHookWords: 14,
  maxTitleChars: 70,
  maxAssetsPerScene: 4
});

// Shared with src/asset.js: asset ids in a brief are the same ids used for asset folders.
export const ASSET_ID = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
// Props or clothing that are not part of Wobble's fixed design.
const OFF_MODEL_ITEM =
  /\b(kacamata|topi|helm|jubah|jas|jaket|syal|masker|ransel|sarung tangan|sepatu bot)\b/i;
const CTA_IN_SPEECH =/\b(subscribe|subscribers?|like|komen|komentar|comment)\b/i;

export class BriefError extends Error {
  constructor(message, { raw } = {}) {
    super(message);
    this.name = "BriefError";
    this.raw = raw;
  }
}

export function countWords(text) {
  return typeof text === "string" ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

// Pulls the first JSON object out of a model reply (tolerates ``` fences and chatter).
export function extractJson(text) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new BriefError("Model reply is empty", { raw: text });
  }

  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new BriefError("No JSON object found in model reply", { raw: text });
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (error) {
    throw new BriefError(`Invalid JSON in model reply (${error.message})`, { raw: text });
  }
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : value;
}

// Keeps only the known fields of format v1 and trims strings. Wrong types are
// left as they are so validateBrief() can report them.
export function normalizeBrief(raw, { topic } = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

  return {
    version: BRIEF_VERSION,
    topic: trimString(topic ?? source.topic),
    title: trimString(source.title),
    hook: trimString(source.hook),
    scenes: Array.isArray(source.scenes)
      ? source.scenes.map((scene) => {
          const item = scene && typeof scene === "object" ? scene : {};
          return {
            id: item.id,
            durationSec: item.durationSec,
            narration: trimString(item.narration),
            visual: trimString(item.visual),
            assets: Array.isArray(item.assets) ? item.assets.map(trimString) : item.assets
          };
        })
      : source.scenes,
    cta: trimString(source.cta)
  };
}

function isText(value) {
  return typeof value === "string" && value.trim() !== "";
}

// Returns { ok, errors, warnings, stats }. Errors block the brief; warnings
// are for the human reviewer.
export function validateBrief(brief) {
  const errors = [];
  const warnings = [];
  const stats = { scenes: 0, totalSec: 0, words: 0 };

  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    return { ok: false, errors: ["brief: must be an object"], warnings, stats };
  }

  if (brief.version !== BRIEF_VERSION) {
    errors.push(`version: must be ${BRIEF_VERSION}`);
  }
  if (!isText(brief.topic)) errors.push("topic: missing or empty");

  if (!isText(brief.title)) {
    errors.push("title: missing or empty");
  } else if (brief.title.length > LIMITS.maxTitleChars) {
    warnings.push(`title: ${brief.title.length} characters (max ${LIMITS.maxTitleChars})`);
  }

  if (!isText(brief.hook)) {
    errors.push("hook: missing or empty");
  } else if (countWords(brief.hook) > LIMITS.maxHookWords) {
    warnings.push(`hook: ${countWords(brief.hook)} words (max ${LIMITS.maxHookWords})`);
  }

  if (!isText(brief.cta)) errors.push("cta: missing or empty");

  if (!Array.isArray(brief.scenes)) {
    errors.push("scenes: must be an array");
    return { ok: false, errors, warnings, stats };
  }

  const scenes = brief.scenes;
  stats.scenes = scenes.length;

  if (scenes.length < LIMITS.minScenes || scenes.length > LIMITS.maxScenes) {
    errors.push(`scenes: ${scenes.length} scenes (need ${LIMITS.minScenes}-${LIMITS.maxScenes})`);
  }

  let totalSec = 0;
  let words = countWords(brief.hook);
  let wobbleInVisual = false;
  let wobbleAsset = false;

  scenes.forEach((scene, index) => {
    const at = `scenes[${index}]`;

    if (!scene || typeof scene !== "object") {
      errors.push(`${at}: must be an object`);
      return;
    }

    if (scene.id !== index + 1) errors.push(`${at}.id: must be ${index + 1}`);

    if (typeof scene.durationSec !== "number" || !Number.isFinite(scene.durationSec)) {
      errors.push(`${at}.durationSec: must be a number`);
    } else {
      totalSec += scene.durationSec;
      if (scene.durationSec < LIMITS.minSceneSec || scene.durationSec > LIMITS.maxSceneSec) {
        errors.push(
          `${at}.durationSec: ${scene.durationSec}s (need ${LIMITS.minSceneSec}-${LIMITS.maxSceneSec}s)`
        );
      }
      if (!Number.isInteger(scene.durationSec)) {
        warnings.push(`${at}.durationSec: ${scene.durationSec} is not a whole number`);
      }
    }

    if (!isText(scene.narration)) {
      errors.push(`${at}.narration: missing or empty`);
    } else {
      words += countWords(scene.narration);
      if (CTA_IN_SPEECH.test(scene.narration)) {
        errors.push(`${at}.narration: contains a like/comment/subscribe call; it belongs in cta`);
      }
    }

    if (!isText(scene.visual)) {
      errors.push(`${at}.visual: missing or empty`);
    } else {
      if (scene.visual.trim().length < 20) warnings.push(`${at}.visual: very short`);
      if (/wobble/i.test(scene.visual)) {
        wobbleInVisual = true;
        const item = scene.visual.match(OFF_MODEL_ITEM);
        if (item) {
          warnings.push(`${at}.visual: "${item[0]}" is not part of Wobble's design`);
        }
      }
    }

    if (!Array.isArray(scene.assets) || scene.assets.length === 0) {
      errors.push(`${at}.assets: need at least 1 asset id`);
    } else {
      if (scene.assets.length > LIMITS.maxAssetsPerScene) {
        errors.push(`${at}.assets: ${scene.assets.length} assets (max ${LIMITS.maxAssetsPerScene})`);
      }
      const seen = new Set();
      scene.assets.forEach((asset) => {
        if (typeof asset !== "string" || !ASSET_ID.test(asset)) {
          errors.push(`${at}.assets: "${asset}" is not a snake_case id`);
          return;
        }
        if (seen.has(asset)) warnings.push(`${at}.assets: duplicate "${asset}"`);
        seen.add(asset);
        if (asset.startsWith("wobble")) wobbleAsset = true;
      });
    }
  });

  stats.totalSec = totalSec;
  stats.words = words;

  if (totalSec < LIMITS.minTotalSec || totalSec > LIMITS.maxTotalSec) {
    errors.push(`scenes: total ${totalSec}s (need ${LIMITS.minTotalSec}-${LIMITS.maxTotalSec}s)`);
  }

  if (words > LIMITS.maxWords) {
    errors.push(`narration: ${words} spoken words (hard max ${LIMITS.maxWords})`);
  } else if (words > LIMITS.targetWords) {
    warnings.push(`narration: ${words} spoken words (target ${LIMITS.targetWords})`);
  } else if (words < LIMITS.minWords) {
    warnings.push(
      `narration: only ${words} spoken words (target ${LIMITS.minWords + 5}-${LIMITS.targetWords}); the video will have silent gaps`
    );
  }

  if (isText(brief.hook) && CTA_IN_SPEECH.test(brief.hook)) {
    errors.push("hook: contains a like/comment/subscribe call; it belongs in cta");
  }

  if (isText(brief.cta)) {
    const missing = [];
    if (!/\blike\b/i.test(brief.cta)) missing.push("like");
    if (!/\b(komen|komentar|comment)\b/i.test(brief.cta)) missing.push("comment");
    if (!/\bsubscribe\b/i.test(brief.cta)) missing.push("subscribe");
    if (missing.length > 0) warnings.push(`cta: does not mention ${missing.join(", ")}`);
  }

  if (scenes.length > 0 && !wobbleInVisual) warnings.push("visual: Wobble never appears in any scene");
  if (scenes.length > 0 && !wobbleAsset) warnings.push('assets: no asset id starts with "wobble"');

  return { ok: errors.length === 0, errors, warnings, stats };
}
