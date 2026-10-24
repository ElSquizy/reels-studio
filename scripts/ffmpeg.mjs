// Finds the ffmpeg/ffprobe binaries that Remotion already installs (no separate ffmpeg install needed)
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const exe = process.platform === "win32" ? ".exe" : "";

const buscar = (nombre) => {
  const base = join(RAIZ, "node_modules/@remotion");
  if (existsSync(base)) {
    for (const d of readdirSync(base)) {
      if (!d.startsWith("compositor-")) continue;
      const p = join(base, d, nombre + exe);
      if (existsSync(p)) return p;
    }
  }
  return nombre; // fallback: one installed on the system PATH
};

export const FFMPEG = buscar("ffmpeg");
export const FFPROBE = buscar("ffprobe");
