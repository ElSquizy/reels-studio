// Reels Studio panel: local web app to upload videos, generate and edit subtitles, and export reels.
// Start with: npm start  → opens http://localhost:4320
import http from "node:http";
import { spawn, exec, execFile } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";
import { FFMPEG } from "../scripts/ffmpeg.mjs";

const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PUERTO = Number(process.env.PORT) || 4320;
const correr = promisify(execFile);
const r = (...p) => join(RAIZ, ...p);
const leerJson = (ruta, def) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : def);

// ---------- settings: brand (config/marca.json) and private keys (config/secretos.json, never committed) ----------
const MARCA_DEF = leerJson(r("config/marca.default.json"), {});
const leerMarca = () => ({ ...MARCA_DEF, ...leerJson(r("config/marca.json"), {}) });
const leerSecretos = () => ({ modo: "local", idioma: "es", openaiKey: "", ...leerJson(r("config/secretos.json"), {}) });
const POR_DEFECTO = leerJson(r("src/por-defecto.json"), {});

// ---------- reels: public/reels/<id>.json + <id>.mp4 ----------
const REELS = () => r("public/reels");
const rutaReel = (id, ext) => join(REELS(), `${id}${ext}`);
const valido = (id) => typeof id === "string" && /^[a-z0-9-]+$/.test(id);
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reel";
const leerReel = (id) => {
  if (!valido(id) || !existsSync(rutaReel(id, ".json"))) throw new Error("Reel not found.");
  return JSON.parse(readFileSync(rutaReel(id, ".json"), "utf8"));
};
const escribirReel = (reel) => writeFileSync(rutaReel(reel.id, ".json"), JSON.stringify(reel, null, 2));
const listarReels = () =>
  existsSync(REELS())
    ? readdirSync(REELS())
        .filter((f) => f.endsWith(".json") && !f.endsWith(".subtitulos.json"))
        .map((f) => { try { const x = JSON.parse(readFileSync(join(REELS(), f), "utf8")); return { id: x.id, nombre: x.nombre, video: x.video, palabras: x.subtitulos.length, duracion: x.duracionVideo, fecha: statSync(join(REELS(), f)).mtimeMs }; } catch { return null; } })
        .filter(Boolean)
        .sort((a, b) => b.fecha - a.fecha)
    : [];

// uploaded file → vertical 1080×1920 MP4 (center crop if it is horizontal)
const subirReel = async (nombre, buffer) => {
  mkdirSync(REELS(), { recursive: true });
  const base = slug(nombre);
  let id = base;
  for (let n = 2; existsSync(rutaReel(id, ".json")); n++) id = `${base}-${n}`;
  const tmp = rutaReel(id, ".upload");
  writeFileSync(tmp, buffer);
  try {
    await correr(FFMPEG, ["-y", "-loglevel", "error", "-i", tmp, "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", rutaReel(id, ".mp4")], { maxBuffer: 1 << 24 });
  } catch {
    throw new Error("Could not read that video. Try an MP4 or MOV file.");
  } finally {
    rmSync(tmp, { force: true });
  }
  let duracionVideo;
  const info = await correr(FFMPEG, ["-i", rutaReel(id, ".mp4")]).catch((e) => e);
  const m = String(info.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (m) duracionVideo = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  const reel = { id, nombre: nombre || id, video: `reels/${id}.mp4`, subtitulos: [], duracionVideo, ...POR_DEFECTO };
  escribirReel(reel);
  return reel;
};
const CAMPOS_EDITABLES = ["nombre", "subtitulos", ...Object.keys(POR_DEFECTO)];
const guardarReel = (id, cambios) => {
  const reel = leerReel(id);
  for (const k of CAMPOS_EDITABLES) if (k in cambios) reel[k] = cambios[k];
  escribirReel(reel);
  return reel;
};
const eliminarReel = (id) => {
  leerReel(id);
  const pap = join(REELS(), ".trash");
  mkdirSync(pap, { recursive: true });
  for (const ext of [".json", ".mp4", ".subtitulos.json"]) if (existsSync(rutaReel(id, ext))) renameSync(rutaReel(id, ext), join(pap, `${id}${ext}`));
  return { id };
};

// ---------- background jobs (transcription and export, one export at a time) ----------
let siguienteId = 1;
const trabajos = [];
const lanzar = (tipo, titulo, args, extra = {}, env = {}) => {
  const t = { id: siguienteId++, tipo, titulo, estado: "corriendo", progreso: null, log: "", inicio: Date.now(), ...extra };
  trabajos.unshift(t);
  const p = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, { cwd: RAIZ, shell: process.platform === "win32", env: { ...process.env, ...env, FORCE_COLOR: "0" } });
  const leer = (b) => {
    const s = b.toString();
    t.log = (t.log + s).slice(-6000);
    const m = [...s.matchAll(/(\d+)\s*\/\s*(\d+)/g)].pop();
    if (tipo === "exportar" && m && Number(m[2]) > 0) t.progreso = Math.min(1, Number(m[1]) / Number(m[2]));
  };
  p.stdout.on("data", leer);
  p.stderr.on("data", leer);
  p.on("close", (code) => {
    t.estado = code === 0 ? "ok" : "error";
    t.fin = Date.now();
    if (code === 0) try { t.alTerminar?.(); } catch (e) { t.estado = "error"; t.log += String.fromCharCode(10) + e.message; }
    if (tipo === "exportar") siguienteExportacion();
  });
  return t;
};
const cola = [];
const siguienteExportacion = () => {
  if (trabajos.some((x) => x.tipo === "exportar" && x.estado === "corriendo") || !cola.length) return;
  const { id, salida, props, titulo } = cola.shift();
  const enCola = trabajos.find((x) => x.enColaDe === id);
  if (enCola) trabajos.splice(trabajos.indexOf(enCola), 1);
  lanzar("exportar", titulo, ["remotion", "render", "src/index.ts", "Reel", salida, `--props=${props}`, "--concurrency=2", `--port=${Number(process.env.RENDER_PORT) || 3210}`], { reel: id, salida });
};
const exportar = (id) => {
  const reel = leerReel(id);
  const salida = `out/${reel.id}.mp4`;
  if (cola.some((c) => c.id === id) || trabajos.some((x) => x.tipo === "exportar" && x.reel === id && x.estado === "corriendo")) throw new Error("This reel is already being exported.");
  mkdirSync(r("out/props"), { recursive: true });
  const props = `out/props/${reel.id}.json`;
  writeFileSync(r(props), JSON.stringify({ ...reel, marca: leerMarca() }));
  const t = { id: siguienteId++, tipo: "exportar", titulo: reel.nombre, estado: "en cola", inicio: Date.now(), log: "", enColaDe: id, reel: id };
  trabajos.unshift(t);
  cola.push({ id, salida, props, titulo: reel.nombre });
  siguienteExportacion();
  return t;
};
const transcribir = (id) => {
  const reel = leerReel(id);
  if (trabajos.some((x) => x.tipo === "transcribir" && x.reel === id && x.estado === "corriendo")) throw new Error("Already transcribing.");
  const s = leerSecretos();
  const nube = s.modo === "openai";
  if (nube && !s.openaiKey) throw new Error("Add your OpenAI key in Settings, or switch to local transcription.");
  return lanzar(
    "transcribir", reel.nombre,
    ["node", nube ? "scripts/transcribir-openai.mjs" : "scripts/transcribir.mjs", `public/${reel.video}`, "--idioma", s.idioma || "es"],
    { reel: id, alTerminar: () => { const subs = leerJson(rutaReel(id, ".subtitulos.json"), null); if (!subs) throw new Error("No subtitles were produced."); guardarReel(id, { subtitulos: subs }); } },
    nube ? { OPENAI_API_KEY: s.openaiKey } : {},
  );
};
const exportados = () =>
  existsSync(r("out")) ? readdirSync(r("out")).filter((f) => f.endsWith(".mp4")).map((f) => ({ archivo: f, mb: +(statSync(r("out", f)).size / 1048576).toFixed(1), fecha: statSync(r("out", f)).mtimeMs })).sort((a, b) => b.fecha - a.fecha) : [];

// ---------- live preview bundle ----------
const construirPrevia = () => build({ entryPoints: [r("src/previa.tsx")], bundle: true, outfile: r("panel/previa.js"), format: "iife", minify: true, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "error" });

// ---------- http ----------
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".mp4": "video/mp4", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2" };
const json = (res, data, code = 200) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(data)); };
const archivo = (res, ruta, req) => {
  if (!existsSync(ruta) || !statSync(ruta).isFile()) return json(res, { error: "not found" }, 404);
  const tipo = TIPOS[extname(ruta).toLowerCase()] ?? "application/octet-stream";
  const total = statSync(ruta).size;
  const rango = req?.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (rango) {
    const ini = rango[1] ? Number(rango[1]) : 0, fin = rango[2] ? Math.min(Number(rango[2]), total - 1) : total - 1;
    res.writeHead(206, { "Content-Type": tipo, "Content-Range": `bytes ${ini}-${fin}/${total}`, "Accept-Ranges": "bytes", "Content-Length": fin - ini + 1 });
    return createReadStream(ruta, { start: ini, end: fin }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": tipo, "Content-Length": total, "Accept-Ranges": "bytes" });
  createReadStream(ruta).pipe(res);
};
const cuerpoCrudo = (req) => new Promise((ok) => { const partes = []; req.on("data", (c) => partes.push(c)); req.on("end", () => ok(Buffer.concat(partes))); });
const cuerpo = async (req) => { const b = await cuerpoCrudo(req); return b.length ? JSON.parse(b.toString("utf8")) : {}; };
const abrir = (destino) => exec(process.platform === "win32" ? `start "" "${destino}"` : process.platform === "darwin" ? `open "${destino}"` : `xdg-open "${destino}"`);

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === "/") return archivo(res, r("panel/index.html"));
    if (p === "/app.js" || p === "/previa.js") return archivo(res, r("panel", p.slice(1)));
    if (p.startsWith("/out/") && !p.includes("..")) return archivo(res, r(p.slice(1)), req);
    if (req.method === "GET" && p.startsWith("/api/")) {
      if (p === "/api/estado") {
        const s = leerSecretos();
        return json(res, {
          configurado: existsSync(r("config/marca.json")),
          marca: leerMarca(),
          ajustes: { modo: s.modo, idioma: s.idioma, tieneClave: !!s.openaiKey },
          reels: listarReels(),
          exportados: exportados(),
          trabajos: trabajos.slice(0, 15).map(({ log, alTerminar, ...t }) => ({ ...t, ultimaLinea: (log ?? "").trim().split("\n").pop() })),
        });
      }
      if (p === "/api/reel") return json(res, leerReel(url.searchParams.get("id")));
    }
    if (req.method === "POST") {
      if (p === "/api/reels/subir") return json(res, await subirReel(url.searchParams.get("nombre") ?? "", await cuerpoCrudo(req)));
      // brand files: logo or font
      if (p === "/api/marca/archivo") {
        const tipo = url.searchParams.get("tipo") === "fuente" ? "fuente" : "logo";
        const ext = (url.searchParams.get("ext") ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const permitidas = tipo === "logo" ? ["png", "jpg", "jpeg", "svg", "webp"] : ["ttf", "otf", "woff", "woff2"];
        if (!permitidas.includes(ext)) throw new Error(`Use one of: ${permitidas.join(", ")}`);
        mkdirSync(r("public/marca"), { recursive: true });
        const nombre = `marca/${tipo}-${Date.now()}.${ext}`;
        writeFileSync(r("public", nombre), await cuerpoCrudo(req));
        return json(res, { archivo: nombre });
      }
      const b = await cuerpo(req);
      if (p === "/api/ajustes") {
        mkdirSync(r("config"), { recursive: true });
        if (b.marca) writeFileSync(r("config/marca.json"), JSON.stringify({ ...leerMarca(), ...b.marca }, null, 2));
        if (b.ajustes) {
          const s = leerSecretos();
          const nuevo = { ...s, modo: b.ajustes.modo ?? s.modo, idioma: b.ajustes.idioma ?? s.idioma };
          if (typeof b.ajustes.openaiKey === "string" && b.ajustes.openaiKey.trim()) nuevo.openaiKey = b.ajustes.openaiKey.trim();
          if (b.ajustes.borrarClave) nuevo.openaiKey = "";
          writeFileSync(r("config/secretos.json"), JSON.stringify(nuevo, null, 2));
        }
        return json(res, { ok: true });
      }
      if (p === "/api/reels/guardar") return json(res, guardarReel(b.id, b.cambios ?? {}));
      if (p === "/api/reels/eliminar") return json(res, eliminarReel(b.id));
      if (p === "/api/reels/transcribir") return json(res, transcribir(b.id));
      if (p === "/api/reels/exportar") return json(res, exportar(b.id));
      if (p === "/api/abrir") {
        if (b.que === "carpeta") { mkdirSync(r("out"), { recursive: true }); abrir(r("out")); }
        if (b.que === "video" && typeof b.archivo === "string" && /^[\w.-]+\.mp4$/.test(b.archivo)) abrir(r("out", b.archivo));
        return json(res, { ok: true });
      }
    }
    // files in public/ (videos, logo, fonts) that the preview loads with staticFile()
    const pub = r("public", p);
    if (req.method === "GET" && !p.includes("..") && existsSync(pub) && statSync(pub).isFile()) return archivo(res, pub, req);
    json(res, { error: "not found" }, 404);
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
}).listen(PUERTO, "127.0.0.1", async () => {
  await construirPrevia().catch((e) => console.error("Preview build failed:", e.message));
  const direccion = `http://localhost:${PUERTO}`;
  console.log(`Reels Studio running at ${direccion}`);
  if (!process.env.NO_OPEN) abrir(direccion);
});
