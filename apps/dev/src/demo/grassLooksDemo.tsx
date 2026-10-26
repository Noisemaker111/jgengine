import { useMemo } from "react";

import { GRASS_PRESETS, readGrassLook } from "@jgengine/core/grass/grassKind";
import type { PlayableGame } from "@jgengine/shell/registry";
import { GrassPatch } from "@jgengine/shell/terrain";

import { demoGame } from "./demoGame";

const PATCH = 16;
const GAP = 2;
const COLUMNS = 4;

/** Every engine preset plus two hand-mixed looks, so one shot shows how far the knobs reach. */
const LOOKS = [
  ...GRASS_PRESETS.map((preset) => ({ label: preset.label, meta: { ...preset.values, seed: preset.id } })),
  { label: "Lavender steppe (custom)", meta: { bladeHeight: 0.7, bladeWidth: 0.02, profile: 0.05, baseColor: "#5a6a4a", tipColor: "#b8c0a0", flowerShare: 0.4,
    flowerColor: "#9a7ad8", flowerColor2: "#c8a8f0", flowerSize: 0.03, seasonNoise: 0.5, windStrength: 0.5, seed: "steppe" } },
  { label: "Frosted tundra (custom)", meta: { bladeHeight: 0.32, heightVariation: 0.5, bladeWidth: 0.05, profile: 0.7, curvature: 0.5, baseColor: "#3e4a40",
    tipColor: "#c8d2cc", dryness: 0.3, patchiness: 0.3, clumping: 0.8, clumpSize: 1.2, windStrength: 0.1, seed: "tundra" } },
];

const patchCenter = (index: number): [number, number] => {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return [(column - (COLUMNS - 1) / 2) * (PATCH + GAP), (row - 0.5 * (Math.ceil(LOOKS.length / COLUMNS) - 1)) * (PATCH + GAP)];
};

function GrassLooks() {
  const looks = useMemo(() => LOOKS.map((entry) => ({ ...entry, look: readGrassLook(entry.meta) })), []);
  const area = useMemo(() => [PATCH, PATCH] as const, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[160, 120]} />
        <meshStandardMaterial color="#4a3f30" roughness={1} />
      </mesh>
      {looks.map((entry, index) => {
        const [x, z] = patchCenter(index);
        return <GrassPatch key={entry.label} position={[x, 0, z]} look={entry.look} area={area} groundColor="#4a3f30" />;
      })}
    </group>
  );
}

export const grassLooksGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "grass-looks" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  lighting: { ambient: { intensity: 0.55 }, directional: [{ intensity: 2.6, position: [30, 40, 20], color: "#fff1dc" }] },
  backdrop: { background: "#9cc0dc" },
  environment: () => <GrassLooks />,
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#fff", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
      <div style={{ position: "absolute", top: 12, left: 16, fontSize: 15, fontWeight: 600 }}>One grass system · {LOOKS.length} looks from the same knobs</div>
      <div style={{ position: "absolute", bottom: 12, left: 16, right: 16, fontSize: 11, display: "grid", gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gap: 4 }}>
        {LOOKS.map((entry, index) => (
          <span key={entry.label}>{index + 1}. {entry.label}</span>
        ))}
      </div>
    </div>
  ),
  capture: {
    views: {
      overview: { look: "0,0,0", lookFrom: "44,26,0.6" },
      ...Object.fromEntries(LOOKS.map((_entry, index) => {
        const [x, z] = patchCenter(index);
        return [`look-${index + 1}`, { look: `${x},0.3,${z}`, lookFrom: "9,2.2,0.5" }];
      })),
    },
  },
};
