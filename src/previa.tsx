// Live preview for the panel (bundled to panel/previa.js with esbuild): Remotion Player, no Studio needed
import React from "react";
import { createRoot } from "react-dom/client";
import { Player, type PlayerRef } from "@remotion/player";
import { Reel, duracionReel, type ReelProps } from "./Reel";

declare global {
  interface Window {
    montarReel: (el: HTMLElement) => { actualizar: (props: ReelProps) => void; irA: (segundos: number) => void; alAvanzar: (fn: (segundos: number) => void) => void; desmontar: () => void };
  }
}

window.montarReel = (el) => {
  const root = createRoot(el);
  const ref = React.createRef<PlayerRef>();
  let oyente: ((s: number) => void) | null = null;
  let enganchado = false;
  return {
    actualizar: (props) => {
      root.render(
        <Player ref={ref} component={Reel} inputProps={props} durationInFrames={duracionReel(props, 30)} compositionWidth={1080} compositionHeight={1920} fps={30} controls acknowledgeRemotionLicense style={{ width: "100%", height: "100%" }} />,
      );
      setTimeout(() => {
        if (enganchado || !ref.current) return;
        enganchado = true;
        ref.current.addEventListener("frameupdate", (e) => oyente?.(e.detail.frame / 30));
      }, 100);
    },
    irA: (s) => ref.current?.seekTo(Math.round(s * 30)),
    alAvanzar: (fn) => { oyente = fn; },
    desmontar: () => root.unmount(),
  };
};
