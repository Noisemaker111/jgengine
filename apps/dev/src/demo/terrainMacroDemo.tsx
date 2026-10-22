import { libraryTerrainMaterial } from "@jgengine/assets/catalogs/materialLibrary";
import { environment, terrain } from "@jgengine/core/world/features";
import type { PlayableGame } from "@jgengine/shell/registry";
import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";

import { demoGame } from "./demoGame";

const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);

/** `?mode=flat` keeps the authored colour, `dense` puts the 2 m turf scan on the ground, `macro` the 24 m variant. */
const MODES = { flat: null, dense: "foliage/grass", macro: "foliage/grass-macro" } as const;
type Mode = keyof typeof MODES;
const mode = (params.get("mode") ?? "macro") as Mode;
const libraryName = MODES[mode in MODES ? mode : "macro"];

const feature = environment({
  terrain: terrain({
    bounds: { w: 220, d: 220 },
    height: 0,
    segments: 80,
    material: "grass",
    colors: { low: "#79a383", high: "#a9c6a0" },
    detail: {
      strength: 1,
      macroScale: 22,
      detailScale: 3,
      ...(libraryName === null ? {} : { material: libraryTerrainMaterial(libraryName) }),
    },
  }),
});

/** One flat field seen from the same RTS height in each mode; only the ground material differs. */
function Ground() {
  return (
    <group>
      <ambientLight intensity={0.25} />
      <directionalLight position={[16, 24, 12]} intensity={1.4} />
      <EnvironmentScene feature={feature} />
    </group>
  );
}

const LABEL = {
  flat: "flat authored colour — no scan",
  dense: "foliage/grass at 2 m — a 1K scan at play scale",
  macro: "foliage/grass-macro at 24 m — grain, authored colour kept",
} as const;

export const terrainMacroGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "terrain-macro" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  look: "flat",
  lighting: { ambient: { intensity: 0.25 }, directional: [{ intensity: 1.4, position: [16, 24, 12], color: "#fff3df" }] },
  backdrop: { background: "#2a2f26" },
  postProcessing: { enabled: true, toneMapping: "aces", exposure: 0.5, bloom: false, ao: false, grade: false, stylize: false, aa: "msaa" },
  environment: Ground,
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#f2f3f0", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
      <div style={{ position: "absolute", top: 14, left: 18, fontSize: 15, fontWeight: 600 }}>Macro ground · {LABEL[mode in LABEL ? mode : "macro"]}</div>
      <div style={{ position: "absolute", bottom: 14, left: 18, fontSize: 11, opacity: 0.85 }}>?mode=flat | dense | macro · one camera, 52 m up</div>
    </div>
  ),
  capture: {
    views: {
      rts: { look: "0,0,0", lookFrom: "8,52" },
    },
  },
};
