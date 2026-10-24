// Shared helpers for both transcription modes
import { readFile } from "node:fs/promises";

// Merges consecutive words that match an entry in correcciones.json (e.g. "mi marka" → "Mi Marca")
export const corregir = async (subs) => {
  const dic = Object.entries(JSON.parse(await readFile(new URL("./correcciones.json", import.meta.url), "utf8"))).filter(([k]) => !k.startsWith("_"));
  const limpio = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
  const out = [];
  for (let i = 0; i < subs.length; i++) {
    let hecho = false;
    for (const [mal, bien] of dic) {
      const n = mal.split(" ").length;
      const grupo = subs.slice(i, i + n);
      if (grupo.length === n && limpio(grupo.map((g) => g.text).join(" ")).replace(/ +/g, " ") === limpio(mal)) {
        const signo = grupo[n - 1].text.match(/[.,!?;:]+$/)?.[0] ?? "";
        out.push({ ...grupo[0], text: (grupo[0].text.startsWith(" ") ? " " : "") + bien + signo, endMs: grupo[n - 1].endMs });
        i += n - 1;
        hecho = true;
        break;
      }
    }
    if (!hecho) out.push(subs[i]);
  }
  // "40" + "%" → "40%": a symbol on its own is glued to the previous word
  return out.reduce((acc, s) => {
    const prev = acc[acc.length - 1];
    if (prev && /^\s*[%€$°]\s*$/.test(s.text)) prev.text += s.text.trim(), (prev.endMs = s.endMs);
    else acc.push({ ...s });
    return acc;
  }, []);
};

export const leerArgs = () => {
  const [archivo, ...resto] = process.argv.slice(2);
  const opt = (k, d) => { const i = resto.indexOf(`--${k}`); return i >= 0 ? resto[i + 1] : d; };
  if (!archivo) throw new Error("Usage: node scripts/transcribir.mjs public/reels/my-video.mp4 [--idioma es]");
  return { archivo, idioma: opt("idioma", "es"), modelo: opt("modelo", null) };
};
export const salidaDe = (archivo) => archivo.replace(/\.[^.]+$/, ".subtitulos.json");
