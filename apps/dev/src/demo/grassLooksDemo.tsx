import { useMemo } from "react";

import { GRASS_PRESETS, readGrassLook } from "@jgengine/core/grass/grassKind";
import type { PlayableGame } from "@jgengine/shell/registry";
import { GrassPatch } from "@jgengine/core/grass/GrassPatch.draw";

import { demoGame } from "./demoGame";

const PATCH = 10;
const GAP = 1.5;
const COLUMNS = 12;

/** Every grass species plus two hand-mixed looks (one species with overrides), so one shot shows how far the knobs reach. */
const LOOKS = [
  ...GRASS_PRESETS.map((preset) => ({ label: preset.label, meta: { species: preset.id, seed: preset.id } })),
  { label: "Moss under reeds (custom)", meta: { species: "sphagnum", mixShare: 0.12, mixHeight: 4, mixWidth: 1.5, mixColor: "#8a9a5a", seed: "moss-reed" } },
  { label: "Windswept twisted steppe (custom)", meta: { bladeHeight: 0.7, bladeWidth: 0.02, profile: 0.05, twist: 0.6, splay: 0.3, lean: 0.5, baseColor: "#5a6a4a",
    tipColor: "#b8c0a0", flowerShare: 0.4, headShape: 0.8, flowerColor: "#9a7ad8", flowerColor2: "#c8a8f0", flowerSize: 0.05, windStrength: 0.5, seed: "steppe" } },
];
const ROWS = Math.ceil(LOOKS.length / COLUMNS);

const patchCenter = (index: number): [number, number] => {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return [(column - (COLUMNS - 1) / 2) * (PATCH + GAP), (row - (ROWS - 1) / 2) * (PATCH + GAP)];
};

function GrassLooks() {
  const looks = useMemo(() => LOOKS.map((entry) => ({ ...entry, look: readGrassLook(entry.meta) })), []);
  const area = useMemo(() => [PATCH, PATCH] as const, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[COLUMNS * (PATCH + GAP) + 20, ROWS * (PATCH + GAP) + 20]} />
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
  scene: {
    renderEntity: () => <group />,
    renderObject: () => <group />,
    environment: () => <GrassLooks />,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  rendering: {
    lighting: { ambient: { intensity: 0.55 }, directional: [{ intensity: 2.6, position: [30, 40, 20], color: "#fff1dc" }] },
    backdrop: { background: "#9cc0dc" },
  },
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#fff", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
      <div style={{ position: "absolute", top: 12, left: 16, fontSize: 15, fontWeight: 600 }}>One grass system · {LOOKS.length} looks from the same knobs</div>
      <div style={{ position: "absolute", top: 40, right: 12, bottom: 12, width: 210, overflowY: "auto", pointerEvents: "auto", fontSize: 10, lineHeight: 1.35, padding: "6px 8px", background: "rgba(0,0,0,0.35)", borderRadius: 6 }}>
        {LOOKS.map((entry, index) => (
          <div key={entry.label}>{index + 1}. {entry.label}</div>
        ))}
      </div>
    </div>
  ),
  capture: {
    views: {
      overview: { look: "0,0,0", lookFrom: "95,120,0.01" },
      ...Object.fromEntries(LOOKS.map((_entry, index) => {
        const [x, z] = patchCenter(index);
        return [`look-${index + 1}`, { look: `${x},0.3,${z}`, lookFrom: "6,1.8,0.5" }];
      })),
      ...Object.fromEntries(LOOKS.map((_entry, index) => {
        const [x, z] = patchCenter(index);
        return [`close-${index + 1}`, { look: `${x},0,${z}`, lookFrom: "1.6,0.45,0.4" }];
      })),
    },
  },
};
