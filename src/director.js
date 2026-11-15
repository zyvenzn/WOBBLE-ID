import { chat } from "./relink.js";
import { BriefError, extractJson, normalizeBrief, validateBrief } from "./brief.js";

// AI Director v2: turns a topic into a video brief (format v1, see brief.js).
//
// Token note: Re:Link bills each prompt as max(actual, 1024) x multiplier and
// adds ~350 hidden tokens. Keeping our own text near 650 tokens means the whole
// prompt stays at about 1000 and no billed token is wasted. Reasoning tokens
// are billed too, so the prompt asks for JSON directly.

export const DIRECTOR_VERSION = 2.1;
export const MAX_TOPIC_CHARS = 200;

export const SYSTEM_PROMPT = [
  "Kamu AI Director channel YouTube pengetahuan umum WOBBLE ID.",
  "Ubah topik jadi brief video vertikal 9:16, +-45 detik, animasi 3D/voxel.",
  "Balas HANYA satu objek JSON valid. Tanpa markdown, tanpa penjelasan, tanpa berpikir panjang: langsung tulis JSON.",
  "",
  "KARAKTER: Wobble, kartun 3D: kulit putih, rambut hitam, sweater ungu bertuliskan WOBBLE, jeans hitam, sneakers merah, memakai mahkota. Jangan tambah aksesori atau pakaian lain (tanpa kacamata, topi, jubah, dll).",
  "Wobble tampil di tiap scene. Setiap visual wajib menyebut ekspresi wajah DAN gerakan tubuh yang spesifik (misal: mata melebar, melompat mundur).",
  "",
  "ATURAN:",
  "- Bahasa Indonesia santai, faktual. Jangan klaim yang tidak bisa diverifikasi, jangan karang angka.",
  "- Fakta harus benar. Jawab pertanyaan yang pasti muncul di kepala penonton (misal: kenapa bukan ungu?), jangan menyederhanakan sampai salah.",
  "- 5 sampai 7 scene, total durasi 40 sampai 50 detik, durasi tiap scene bilangan bulat 3 sampai 12.",
  "- Total kata hook + semua narration antara 90 dan 110 (narration tiap scene sekitar 2 kata per detik durasinya).",
  "- hook: 1 kalimat pembuka maks 12 kata. Scene 1 tidak mengulanginya.",
  "- narration: hanya kalimat yang diucapkan, tanpa ajakan like/komen/subscribe.",
  "- Scene terakhir ditutup dengan fakta atau kesimpulan, bukan ajakan.",
  "- cta: 1 kalimat ajakan like, komen, dan subscribe. Hanya ada di field cta.",
  "- visual: 1-2 kalimat adegan 3D/voxel (latar, aksi, kamera).",
  "- assets: 1-4 id snake_case huruf kecil, misal voxel_earth, wobble_character.",
  "",
  "FORMAT (id urut mulai 1):",
  '{"title":"","hook":"","scenes":[{"id":1,"durationSec":0,"narration":"","visual":"","assets":[""]}],"cta":""}'
].join("\n");

export function buildMessages(topic) {
  const clean = typeof topic === "string" ? topic.trim() : "";
  if (!clean) {
    throw new BriefError("Topic is empty");
  }
  if (clean.length > MAX_TOPIC_CHARS) {
    throw new BriefError(`Topic is too long (${clean.length} characters, max ${MAX_TOPIC_CHARS})`);
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Topik: ${clean}` }
  ];
}

// Rough estimate only (about 3 characters per token for Indonesian text).
// The real number is usage.prompt_tokens in the reply.
export function estimatePromptTokens(messages) {
  const chars = messages.reduce((sum, message) => sum + message.content.length, 0);
  return Math.ceil(chars / 3);
}

// One request. Returns the brief (or null when the reply had no usable JSON),
// its validation and the raw reply. RelinkError is not caught here.
export async function generateBrief(topic, { model, maxTokens, temperature = 0.7 } = {}) {
  const messages = buildMessages(topic);
  const result = await chat(messages, { model, maxTokens, temperature });

  const meta = {
    raw: result.content,
    usage: result.usage,
    model: result.model,
    finishReason: result.finishReason
  };

  let parsed;
  try {
    parsed = extractJson(result.content);
  } catch (error) {
    if (!(error instanceof BriefError)) throw error;
    return {
      ...meta,
      brief: null,
      validation: { ok: false, errors: [error.message], warnings: [], stats: null }
    };
  }

  const brief = normalizeBrief(parsed, { topic: topic.trim() });
  return { ...meta, brief, validation: validateBrief(brief) };
}
