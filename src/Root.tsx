import React from "react";
import { Composition } from "remotion";
import { Reel, reelSchema, duracionReel, REEL_POR_DEFECTO } from "./Reel";
import marca from "../config/marca.default.json";

// The panel renders this composition with --props=out/props/<id>.json
export const RemotionRoot: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    schema={reelSchema}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={300}
    defaultProps={{ ...REEL_POR_DEFECTO, video: "", subtitulos: [], marca }}
    calculateMetadata={({ props }) => ({ durationInFrames: duracionReel(props, 30) })}
  />
);
