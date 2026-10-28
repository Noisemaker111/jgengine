import { useEffect, useMemo, useState } from "react";

import { prepareGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import { PLANT_GROWN_GENERATOR } from "@jgengine/core/plants/grown/plantGrown";
import { isPlantMesh, type PlantMesh } from "@jgengine/core/plants/mesh/plantMesh";
import { plantMeshSources } from "@jgengine/core/plants/mesh/plantMesh.draw";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

/** Three looks built from style params alone; the engine names none of them. */
const STYLES = [
  { label: "Realistic", meta: { foliage: "leaves", shading: "lit", barkGrain: true } },
  { label: "Toon", meta: { foliage: "leaves", shading: "ramp", rampBands: 3, rampSoftness: 0.08, rampShadow: 0.4, saturation: 1.35, brightness: 1.1, barkGrain: false } },
  {
    label: "Clay",
    meta: { foliage: "clumps", shading: "lit", paint: 0.9, brightness: 1.05, colorJitter: 0.03, barkGrain: false, leafTint: "#e9d8c4", barkTint: "#cdb8a0" },
  },
];

const PLANTS = [
  { label: "Sugar maple, 60 years", x: 0, meta: { species: "acer-saccharum", age: 60, seed: "triptych-maple" } },
  { label: "Eastern white pine, 60 years", x: 150, meta: { species: "pinus-strobus", age: 60, seed: "triptych-pine" } },
];

const SPACING = 22;
/** The realistic look again at the three lower detail levels, beside each tree's style row. */
const DETAILS = [0.5, 0.25, 0.1];
const DETAIL_ROW_OFFSET = 75;
/** A contact sheet of 100 sugar maples of one age, each from its own seed (the unique-trees test's seeds). */
const UNIQUE = { x: 300, columns: 10, rows: 10, spacing: 11, age: 20, detail: 0.25 };

function GrownPlant({ meta, detail, position }: { meta: Record<string, unknown>; detail: number; position: [number, number, number] }) {
  const [mesh, setMesh] = useState<PlantMesh | null>(null);
  useEffect(() => {
    let live = true;
    const done = trackSceneWork(`plant-styles:${detail}:${JSON.stringify(meta)}`);
    prepareGenerator(PLANT_GROWN_GENERATOR, meta, { detail })
      .then(() => {
        const output = runGenerator(PLANT_GROWN_GENERATOR, meta, { detail });
        if (live && isPlantMesh(output)) setMesh(output);
      })
      .finally(done);
    return () => {
      live = false;
    };
  }, [meta, detail]);
  const sources = useMemo(() => (mesh === null ? [] : plantMeshSources(mesh)), [mesh]);
  useEffect(() => () => sources.forEach((source) => source.geometry.dispose()), [sources]);
  return (
    <group position={position}>
      {sources.map((source, index) => (
        <mesh key={index} geometry={source.geometry} material={source.material} castShadow receiveShadow />
      ))}
    </group>
  );
}

function PlantStyles() {
  const placements = useMemo(
    () =>
      PLANTS.flatMap((plant) => [
        ...STYLES.map((style, column) => ({
          key: `${plant.label}/${style.label}`,
          meta: { ...plant.meta, ...style.meta },
          detail: 1,
          position: [plant.x + (column - 1) * SPACING, 0, 0] satisfies [number, number, number],
        })),
        ...DETAILS.map((detail, column) => ({
          key: `${plant.label}/detail ${detail}`,
          meta: { ...plant.meta, ...STYLES[0]?.meta },
          detail,
          position: [plant.x + DETAIL_ROW_OFFSET + (column - 1) * SPACING, 0, 0] satisfies [number, number, number],
        })),
      ]).concat(
        Array.from({ length: UNIQUE.columns * UNIQUE.rows }, (_, k) => ({
          key: `unique/${k}`,
          meta: { species: "acer-saccharum", age: UNIQUE.age, seed: `maple-${k}`, ...STYLES[0]?.meta },
          detail: UNIQUE.detail,
          position: [UNIQUE.x + (k % UNIQUE.columns) * UNIQUE.spacing, 0, Math.floor(k / UNIQUE.columns) * UNIQUE.spacing] satisfies [number, number, number],
        })),
      ),
    [],
  );
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[900, 400]} />
        <meshStandardMaterial color="#6b7a4a" roughness={1} />
      </mesh>
      {placements.map((entry) => (
        <GrownPlant key={entry.key} meta={entry.meta} detail={entry.detail} position={entry.position} />
      ))}
    </group>
  );
}

/** One grown maple and one grown pine, each in three looks from the same structure and at each lower detail level. */
export const plantStylesGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "plant-styles" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  lighting: { ambient: { intensity: 0.6 }, directional: [{ intensity: 2.4, position: [40, 60, 30], color: "#fff1dc" }] },
  backdrop: { background: "#a8c8e0" },
  environment: () => <PlantStyles />,
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#fff", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
      <div style={{ position: "absolute", top: 12, left: 16, fontSize: 15, fontWeight: 600 }}>
        One grown structure per tree · styles: realistic, toon, clay · detail rows: 30k, 8k, 1.5k triangles (left to right)
      </div>
    </div>
  ),
  capture: {
    views: {
      maples: { look: "0,11,0", lookFrom: "62,10,0" },
      pines: { look: "150,12,0", lookFrom: "62,10,0" },
      "maple-details": { look: "75,11,0", lookFrom: "62,10,0" },
      "pine-details": { look: "225,12,0", lookFrom: "62,10,0" },
      unique: { look: "350,4,48", lookFrom: "122,52,0" },
    },
  },
};
