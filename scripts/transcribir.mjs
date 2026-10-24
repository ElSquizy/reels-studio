// Local transcription with Whisper on your GPU (free, offline after the first model download).
// Usage: node scripts/transcribir.mjs public/reels/my-video.mp4 --idioma es
// Writes public/reels/my-video.subtitulos.json in @remotion/captions "Caption" format.
import { registerMediabunnyServer } from "@mediabunny/server";
import { WHISPER_WEBGPU_SAMPLE_RATE, canUseWhisperWebGpu, downloadWhisperModel, loadWhisperModel, toCaptions, transcribe } from "@remotion/whisper-webgpu";
import { ALL_FORMATS, Conversion, FilePathSource, Input, NullTarget, Output, WavOutputFormat } from "mediabunny";
import { writeFile } from "node:fs/promises";
import { corregir, leerArgs, salidaDe } from "./subtitulos.mjs";

const { archivo, idioma, modelo: elegido } = leerArgs();
// English-only models are smaller and better for English; everything else needs a multilingual one
const MODELO = elegido ?? (idioma === "en" ? "small.en" : "small");

registerMediabunnyServer();
const soporte = await canUseWhisperWebGpu();
if (!soporte.supported) throw new Error(`Local transcription is not available on this computer (${soporte.detailedReason}). Use OpenAI in Settings.`);

// decode audio to 16 kHz mono
const trozos = [];
const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(archivo) });
const pista = await input.getPrimaryAudioTrack();
if (!pista) throw new Error("The video has no audio track.");
const conversion = await Conversion.init({
  input,
  output: new Output({ format: new WavOutputFormat(), target: new NullTarget() }),
  video: { discard: true },
  audio: (track) =>
    track.id !== pista.id
      ? { discard: true }
      : {
          codec: "pcm-f32", forceTranscode: true, numberOfChannels: 1, sampleFormat: "f32", sampleRate: WHISPER_WEBGPU_SAMPLE_RATE,
          process: (muestra) => {
            const onda = new Float32Array(muestra.allocationSize({ format: "f32", planeIndex: 0 }) / 4);
            muestra.copyTo(onda, { format: "f32", planeIndex: 0 });
            trozos.push({ desde: Math.round(muestra.timestamp * WHISPER_WEBGPU_SAMPLE_RATE), onda });
            return muestra;
          },
        },
});
if (!conversion.isValid) throw new Error("Could not decode the audio.");
await conversion.execute();
const largo = trozos.reduce((m, t) => Math.max(m, t.desde + t.onda.length), 0);
const channelWaveform = new Float32Array(largo);
for (const t of trozos) channelWaveform.set(t.onda.subarray(0, Math.min(t.onda.length, largo - Math.max(0, t.desde))), Math.max(0, t.desde));

console.log(`Transcribing with Whisper "${MODELO}" (${idioma})…`);
await downloadWhisperModel({ model: MODELO });
const modelo = await loadWhisperModel({ model: MODELO });
const resultado = await transcribe({ channelWaveform, model: MODELO, language: idioma });
const captions = await corregir(toCaptions({ whisperWebGpuOutput: resultado }).captions);
await modelo[Symbol.asyncDispose]?.();
await writeFile(salidaDe(archivo), JSON.stringify(captions, null, 2));
console.log(`Done: ${captions.length} words`);
