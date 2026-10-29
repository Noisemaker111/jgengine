import { Html } from "@react-three/drei";
import { useMemo } from "react";

import { GRASS_DEFAULTS, type GrassLook } from "@jgengine/core/grass/grassKind";
import { GrassPatch } from "@jgengine/core/grass/GrassPatch.draw";
import { GROUND_COVER_LIBRARY } from "@jgengine/core/plants/groundCover/groundCoverSpecies";
import { createTillerField, tillerCellLook, type TillerField } from "@jgengine/core/plants/groundCover/tillerSim";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

const SPECIES = GROUND_COVER_LIBRARY;
/** Seed mix by species: ryegrass, timothy, bluegrass, clover, dandelion, oxeye daisy, moss. */
const SOWN = [3, 2, 3, 1, 0.3, 1, 0.5];
const ALL = { col: 0, row: 0 };
const PATCH = 6;
const GAP = 1.5;
/** Read every field at midsummer of its second year. */
const WEEKS = 52 + 26;

interface Scene {
  label: string;
  /** What happens to the field in a given week, before it grows. */
  care: (field: TillerField, week: number) => void;
  light?: number;
}

const SCENES: Scene[] = [
  { label: "Lawn · mown every 2 weeks", care: (field, week) => week % 2 === 1 && field.mow(ALL, 0.04) },
  { label: "Meadow · left uncut", care: () => {} },
  { label: "Path · trampled this spring", care: (field, week) => {
    if (week % 2 === 1) field.mow(ALL, 0.05);
    if (week >= 52 + 8) field.trample(ALL, 1);
  } },
  { label: "Under trees · 10% light", care: () => {}, light: 0.1 },
];

function grownLook(scene: Scene): GrassLook {
  const field = createTillerField({ species: SPECIES, cols: 1, rows: 1, sown: SOWN });
  if (scene.light !== undefined) field.setLight(ALL, scene.light);
  for (let week = 0; week < WEEKS; week += 1) {
    scene.care(field, week);
    field.step();
  }
  return tillerCellLook(field, SPECIES, 0, 0, { ...GRASS_DEFAULTS, windStrength: 0.25 });
}

const patchX = (index: number): number => (index - (SCENES.length - 1) / 2) * (PATCH + GAP);

function GrassFields() {
  const looks = useMemo(() => SCENES.map(grownLook), []);
  const area = useMemo(() => [PATCH, PATCH] as const, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[60, 30]} />
        <meshStandardMaterial color="#4a3f30" roughness={1} />
      </mesh>
      {SCENES.map((scene, index) => (
        <group key={scene.label}>
          <GrassPatch position={[patchX(index), 0, 0]} look={looks[index] ?? GRASS_DEFAULTS} area={area} groundColor="#4a3f30" />
          <Html position={[patchX(index), 0, PATCH / 2 + 0.8]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
            <div style={{ color: "#fff", font: "600 13px sans-serif", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{scene.label}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}

/** Four ground-cover fields grown from the same tiller sim and seed mix, cared for four ways, read at midsummer. */
export const grassFieldGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "grass-field" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  lighting: { ambient: { intensity: 0.55 }, directional: [{ intensity: 2.6, position: [20, 30, 25], color: "#fff1dc" }] },
  backdrop: { background: "#9cc0dc" },
  environment: () => <GrassFields />,
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", top: 12, left: 16, color: "#fff", font: "600 15px sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
      Grasses, clover, dandelion, oxeye daisy and moss sown the same way, grown 18 months
    </div>
  ),
  capture: { views: { overview: { look: "0,0.3,0", lookFrom: "17,8,0" } } },
};
