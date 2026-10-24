// Cloud transcription with OpenAI Whisper (for computers without a compatible GPU).
// Needs OPENAI_API_KEY in the environment (the panel passes the key you saved in Settings).
// Usage: node scripts/transcribir-openai.mjs public/reels/my-video.mp4 --idioma es
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { FFMPEG } from "./ffmpeg.mjs";
import { corregir, leerArgs, salidaDe } from "./subtitulos.mjs";

const { archivo, idioma } = leerArgs();
const clave = process.env.OPENAI_API_KEY;
if (!clave) throw new Error("Missing OPENAI_API_KEY. Add your key in Settings.");

// small mono MP3: keeps uploads well under OpenAI's 25 MB limit
const audio = archivo.replace(/\.[^.]+$/, ".audio.mp3");
await promisify(execFile)(FFMPEG, ["-y", "-loglevel", "error", "-i", archivo, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audio]);

console.log(`Transcribing with OpenAI (${idioma})…`);
const form = new FormData();
form.append("file", new Blob([await readFile(audio)], { type: "audio/mpeg" }), "audio.mp3");
form.append("model", "whisper-1");
form.append("response_format", "verbose_json");
form.append("timestamp_granularities[]", "word");
form.append("language", idioma);
const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${clave}` }, body: form });
await rm(audio, { force: true });
const j = await r.json();
if (!r.ok) throw new Error(`OpenAI: ${j.error?.message ?? r.status}`);

// OpenAI returns words without punctuation: take it back from the full text when it matches
const conSignos = (j.text ?? "").split(/\s+/).filter(Boolean);
const captions = (j.words ?? []).map((w, i) => {
  const original = conSignos[i];
  const texto = original && original.replace(/[^\p{L}\p{N}%]/gu, "").toLowerCase() === w.word.replace(/[^\p{L}\p{N}%]/gu, "").toLowerCase() ? original : w.word;
  return { text: (i ? " " : "") + texto, startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000), timestampMs: Math.round(((w.start + w.end) / 2) * 1000), confidence: null };
});
await writeFile(salidaDe(archivo), JSON.stringify(await corregir(captions), null, 2));
console.log(`Done: ${captions.length} words`);
