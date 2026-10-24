import { z } from "zod";
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import porDefecto from "./por-defecto.json";
import { FUENTES } from "./fuentes";

// =====================================================================
// "Reel" template: your video + word-by-word subtitles in your brand style
// (brand name, logo, colors and font come from the setup screen)
// =====================================================================

export const marcaSchema = z.object({
  nombre: z.string(),
  logo: z.string(), // file in public/ (empty = brand name as text)
  web: z.string(),
  colorMarca: z.string(),
  colorSecundario: z.string(),
  colorTexto: z.string(),
  fuente: z.string(), // one of FUENTES, or "archivo" to use fuenteArchivo
  fuenteArchivo: z.string(),
});

export const reelSchema = z.object({
  video: z.string(), // file in public/
  subtitulos: z.array(z.object({ text: z.string(), startMs: z.number(), endMs: z.number(), timestampMs: z.number().nullable(), confidence: z.number().nullable() })),
  estilo: z.enum(["resaltado", "palabra", "simple"]), // how the spoken word is highlighted
  tamano: z.number(),
  posicionY: z.number(), // vertical center of the subtitles
  mayusculas: z.boolean(),
  mostrarLogo: z.boolean(),
  cierre: z.boolean(), // closing card with logo and website
  segundosCierre: z.number(),
  duracionVideo: z.number().optional(),
  marca: marcaSchema,
});
export type ReelProps = z.infer<typeof reelSchema>;
export const REEL_POR_DEFECTO = porDefecto as Omit<ReelProps, "video" | "subtitulos" | "marca">;
type Marca = ReelProps["marca"];

const fuenteDe = (m: Marca) => (m.fuente === "archivo" && m.fuenteArchivo ? "MarcaPropia" : (FUENTES[m.fuente] ?? FUENTES.Montserrat)());

// ---------- brand pieces ----------
const Logo: React.FC<{ m: Marca; ancho: number; fuente: string }> = ({ m, ancho, fuente }) =>
  m.logo ? (
    <Img src={staticFile(m.logo)} style={{ width: ancho, maxHeight: ancho * 0.6, objectFit: "contain" }} />
  ) : (
    <div style={{ fontFamily: fuente, fontSize: ancho / 6, color: m.colorTexto, letterSpacing: 1, textShadow: "0 3px 12px rgba(0,0,0,0.5)" }}>{m.nombre}</div>
  );

// ---------- subtitles ----------
type Pagina = ReturnType<typeof createTikTokStyleCaptions>["pages"][number];
const PaginaVista: React.FC<{ pagina: Pagina; p: ReelProps; fuente: string }> = ({ pagina, p, fuente }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = pagina.startMs + (frame / fps) * 1000;
  const entra = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });
  const m = p.marca;
  return (
    <div
      style={{
        position: "absolute", left: 70, right: 70, top: p.posicionY, transform: `translateY(-50%) scale(${0.85 + 0.15 * entra})`, opacity: entra,
        textAlign: "center", fontFamily: fuente, fontSize: p.tamano, lineHeight: 1.18, color: m.colorTexto,
        textTransform: p.mayusculas ? "uppercase" : "none", whiteSpace: "pre-wrap",
        textShadow: "0 4px 18px rgba(0,0,0,0.65), 0 2px 4px rgba(0,0,0,0.6)",
      }}
    >
      {pagina.tokens.map((t, i) => {
        const activa = ms >= t.fromMs && ms < t.toMs;
        const estilo: React.CSSProperties =
          p.estilo === "resaltado" && activa
            ? { background: m.colorMarca, borderRadius: 12, padding: "0 12px", margin: "0 -6px", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", textShadow: "none" }
            : p.estilo === "palabra"
              ? { color: activa ? m.colorMarca : m.colorTexto, opacity: ms >= t.fromMs ? 1 : 0.55 }
              : {};
        return <span key={i} style={estilo}>{t.text}</span>;
      })}
    </div>
  );
};

const Subtitulos: React.FC<{ p: ReelProps; fuente: string }> = ({ p, fuente }) => {
  const { fps } = useVideoConfig();
  const { pages } = React.useMemo(() => createTikTokStyleCaptions({ captions: p.subtitulos as Caption[], combineTokensWithinMilliseconds: 1100 }), [p.subtitulos]);
  return (
    <>
      {pages.map((pg, i) => {
        const desde = Math.round((pg.startMs / 1000) * fps);
        const hasta = Math.round(((pages[i + 1]?.startMs ?? pg.startMs + pg.durationMs) / 1000) * fps);
        return hasta > desde ? (
          <Sequence key={i} from={desde} durationInFrames={hasta - desde} layout="none">
            <PaginaVista pagina={pg} p={p} fuente={fuente} />
          </Sequence>
        ) : null;
      })}
    </>
  );
};

const Cierre: React.FC<{ p: ReelProps; fuente: string }> = ({ p, fuente }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame, fps, config: { damping: 18 } });
  const m = p.marca;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${m.colorSecundario}, ${m.colorMarca})`, opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" }), justifyContent: "center", alignItems: "center", gap: 40 }}>
      <div style={{ transform: `scale(${0.8 + 0.2 * entra})` }}><Logo m={m} ancho={620} fuente={fuente} /></div>
      {m.web ? <div style={{ fontFamily: fuente, fontSize: 46, color: m.colorTexto, opacity: entra, letterSpacing: 2 }}>{m.web}</div> : null}
    </AbsoluteFill>
  );
};

export const duracionReel = (p: { subtitulos: { endMs: number }[]; cierre: boolean; segundosCierre: number; duracionVideo?: number }, fps: number) => {
  const fin = Math.max(p.duracionVideo ?? 0, (p.subtitulos[p.subtitulos.length - 1]?.endMs ?? 5000) / 1000 + 0.6);
  return Math.max(fps, Math.ceil((fin + (p.cierre ? p.segundosCierre : 0)) * fps));
};

export const Reel: React.FC<ReelProps> = (p) => {
  const { fps, durationInFrames } = useVideoConfig();
  const fuente = React.useMemo(() => fuenteDe(p.marca), [p.marca]);
  const inicioCierre = p.cierre ? durationInFrames - Math.round(p.segundosCierre * fps) : durationInFrames;
  const fuentePropia = p.marca.fuente === "archivo" && p.marca.fuenteArchivo ? `@font-face { font-family: 'MarcaPropia'; src: url('${staticFile(p.marca.fuenteArchivo)}'); }` : null;
  return (
    <AbsoluteFill style={{ background: "black" }}>
      {fuentePropia ? <style>{fuentePropia}</style> : null}
      {p.video ? <OffthreadVideo src={staticFile(p.video)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      {/* soft gradients so logo and subtitles read over any footage */}
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45), transparent 18%, transparent 55%, rgba(0,0,0,0.5) 85%)" }} />
      {p.mostrarLogo ? <div style={{ position: "absolute", top: 120, width: "100%", display: "flex", justifyContent: "center" }}><Logo m={p.marca} ancho={380} fuente={fuente} /></div> : null}
      <Subtitulos p={p} fuente={fuente} />
      {p.cierre ? (
        <Sequence from={inicioCierre}>
          <Cierre p={p} fuente={fuente} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
