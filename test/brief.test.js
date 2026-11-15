import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRIEF_VERSION,
  BriefError,
  countWords,
  extractJson,
  normalizeBrief,
  validateBrief
} from "../src/brief.js";
import { buildMessages, estimatePromptTokens } from "../src/director.js";

function goodBrief() {
  return {
    version: BRIEF_VERSION,
    topic: "Mengapa langit berwarna biru?",
    title: "Kenapa Langit Biru?",
    hook: "Langit itu sebenarnya tidak biru, lho!",
    scenes: [
      {
        id: 1,
        durationSec: 7,
        narration: "Cahaya matahari tampak putih, tapi isinya campuran semua warna pelangi.",
        visual: "Wobble menatap matahari voxel dengan mata melebar, kamera zoom pelan.",
        assets: ["voxel_sun", "wobble_character"]
      },
      {
        id: 2,
        durationSec: 8,
        narration: "Saat masuk atmosfer, cahaya menabrak molekul udara yang sangat kecil.",
        visual: "Wobble melompat mundur saat sinar pecah jadi warna-warni di langit voxel.",
        assets: ["voxel_atmosphere", "wobble_character"]
      },
      {
        id: 3,
        durationSec: 8,
        narration: "Cahaya biru dihamburkan jauh lebih kuat daripada warna merah.",
        visual: "Panah biru memantul ke segala arah, Wobble tersenyum lebar sambil menunjuk.",
        assets: ["voxel_light_rays", "wobble_character"]
      },
      {
        id: 4,
        durationSec: 8,
        narration: "Hamburan itu bernama hamburan Rayleigh, dan membuat seluruh langit tampak biru.",
        visual: "Kamera naik ke langit biru penuh, Wobble melambai dengan mahkota berkilau.",
        assets: ["voxel_sky", "wobble_character"]
      },
      {
        id: 5,
        durationSec: 7,
        narration: "Waktu senja, cahaya menempuh jalur lebih panjang sehingga biru habis terhambur.",
        visual: "Matahari terbenam oranye, Wobble mengangguk kagum dengan mata berbinar.",
        assets: ["voxel_sunset", "wobble_character"]
      },
      {
        id: 6,
        durationSec: 7,
        narration: "Yang tersisa adalah merah dan oranye, jadi langit senja terlihat hangat.",
        visual: "Wobble duduk santai di bukit voxel, kamera menjauh perlahan.",
        assets: ["voxel_hill", "wobble_character"]
      }
    ],
    cta: "Kalau suka, like, komen, dan subscribe WOBBLE ID ya!"
  };
}

test("a good brief passes without errors", () => {
  const result = validateBrief(goodBrief());
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.stats.scenes, 6);
  assert.equal(result.stats.totalSec, 45);
  assert.ok(result.stats.words <= 110);
});

test("too few scenes and wrong total duration are errors", () => {
  const brief = goodBrief();
  brief.scenes = brief.scenes.slice(0, 3);
  const { errors } = validateBrief(brief);
  assert.ok(errors.some((message) => message.includes("3 scenes")));
  assert.ok(errors.some((message) => message.includes("total 23s")));
});

test("scene ids must be sequential", () => {
  const brief = goodBrief();
  brief.scenes[2].id = 9;
  assert.ok(validateBrief(brief).errors.some((message) => message.startsWith("scenes[2].id")));
});

test("a CTA inside the last narration is an error", () => {
  const brief = goodBrief();
  brief.scenes[5].narration += " Jangan lupa subscribe ya!";
  const { errors } = validateBrief(brief);
  assert.ok(errors.some((message) => message.startsWith("scenes[5].narration")));
});

test("too many spoken words is an error, a few extra is a warning", () => {
  const brief = goodBrief();
  const filler = Array(70).fill("kata").join(" ");
  brief.scenes[0].narration += ` ${filler}`;
  assert.ok(validateBrief(brief).errors.some((message) => message.includes("spoken words")));

  const slightly = goodBrief();
  slightly.scenes[0].narration += ` ${Array(45).fill("kata").join(" ")}`;
  const result = validateBrief(slightly);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((message) => message.includes("spoken words")));
});

test("asset ids must be snake_case and present", () => {
  const brief = goodBrief();
  brief.scenes[0].assets = ["Voxel Sun"];
  brief.scenes[1].assets = [];
  const { errors } = validateBrief(brief);
  assert.ok(errors.some((message) => message.includes("not a snake_case id")));
  assert.ok(errors.some((message) => message.startsWith("scenes[1].assets")));
});

test("a missing cta field is an error, a weak cta is a warning", () => {
  const missing = goodBrief();
  missing.cta = "";
  assert.ok(validateBrief(missing).errors.some((message) => message.startsWith("cta")));

  const weak = goodBrief();
  weak.cta = "Sampai jumpa!";
  const result = validateBrief(weak);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((message) => message.startsWith("cta")));
});

test("non-object input does not crash the validator", () => {
  assert.equal(validateBrief(null).ok, false);
  assert.equal(validateBrief({ ...goodBrief(), scenes: "x" }).ok, false);
});

test("extractJson handles code fences and surrounding text", () => {
  const fenced = 'Ini hasilnya:\n```json\n{"title":"A","scenes":[]}\n```';
  assert.deepEqual(extractJson(fenced), { title: "A", scenes: [] });
});

test("extractJson throws BriefError with the raw text", () => {
  assert.throws(() => extractJson("tidak ada json"), BriefError);
  assert.throws(() => extractJson("{rusak: }"), (error) => error.raw === "{rusak: }");
  assert.throws(() => extractJson(""), BriefError);
});

test("normalizeBrief keeps known fields, trims text and sets version and topic", () => {
  const brief = normalizeBrief(
    { title: "  Judul  ", hook: "Hai", extra: "x", scenes: [{ id: 1, narration: " a ", junk: 1 }], cta: "c" },
    { topic: "  topik  " }
  );
  assert.equal(brief.version, BRIEF_VERSION);
  assert.equal(brief.topic, "topik");
  assert.equal(brief.title, "Judul");
  assert.equal("extra" in brief, false);
  assert.equal("junk" in brief.scenes[0], false);
  assert.equal(brief.scenes[0].narration, "a");
});

test("countWords", () => {
  assert.equal(countWords("  satu dua   tiga "), 3);
  assert.equal(countWords(""), 0);
  assert.equal(countWords(undefined), 0);
});

test("director prompt contains the topic, the character and stays small", () => {
  const messages = buildMessages("  Mengapa langit biru?  ");
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, "Topik: Mengapa langit biru?");
  assert.ok(messages[0].content.includes("sweater ungu"));
  assert.ok(messages[0].content.includes("antara 90 dan 110"));
  assert.ok(messages[0].content.includes("tanpa kacamata"));
  // Real prompt = our text + ~350 hidden gateway tokens. Staying under about 640
  // keeps the total near the 1024 billing minimum.
  assert.ok(estimatePromptTokens(messages) <= 640, "prompt grew past the token budget");
});

test("too few spoken words is a warning, not an error", () => {
  const result = validateBrief(goodBrief());
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((message) => message.includes("silent gaps")));

  const full = goodBrief();
  full.scenes[0].narration += ` ${Array(30).fill("kata").join(" ")}`;
  assert.ok(!validateBrief(full).warnings.some((message) => message.includes("silent gaps")));
});

test("an accessory that is not in Wobble's design is a warning", () => {
  const brief = goodBrief();
  brief.scenes[2].visual = "Wobble memakai kacamata pelindung dan mencondong ke depan penasaran.";
  const result = validateBrief(brief);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((message) => message.includes("kacamata")));
  assert.ok(!validateBrief(goodBrief()).warnings.some((message) => message.includes("not part of")));
});

test("director rejects empty or oversized topics", () => {
  assert.throws(() => buildMessages("   "), BriefError);
  assert.throws(() => buildMessages("x".repeat(201)), BriefError);
});
