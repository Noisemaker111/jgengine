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
  { label: "Toon", meta: { foliage: "clumps", shading: "ramp", rampBands: 3, rampSoftness: 0.08, rampShadow: 0.4, saturation: 1.35, brightness: 1.1, barkGrain: false } },
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

function GrownPlant({ meta, position }: { meta: Record<string, unknown>; position: [number, number, number] }) {
  const [mesh, setMesh] = useState<PlantMesh | null>(null);
  useEffect(() => {
    let live = true;
    const done = trackSceneWork(`plant-styles:${JSON.stringify(meta)}`);
    prepareGenerator(PLANT_GROWN_GENERATOR, meta)
      .then(() => {
        const output = runGenerator(PLANT_GROWN_GENERATOR, meta);
        if (live && isPlantMesh(output)) setMesh(output);
      })
      .finally(done);
    return () => {
      live = false;
    };
  }, [meta]);
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
      PLANTS.flatMap((plant) =>
        STYLES.map((style, column) => ({
          key: `${plant.label}/${style.label}`,
          meta: { ...plant.meta, ...style.meta },
          position: [plant.x + (column - 1) * SPACING, 0, 0] satisfies [number, number, number],
        })),
      ),
    [],
  );
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[500, 200]} />
        <meshStandardMaterial color="#6b7a4a" roughness={1} />
      </mesh>
      {placements.map((entry) => (
        <GrownPlant key={entry.key} meta={entry.meta} position={entry.position} />
      ))}
    </group>
  );
}

/** One grown maple and one grown pine, each in three looks from the same structure. */
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
      <div style={{ position: "absolute", top: 12, left: 16, fontSize: 15, fontWeight: 600 }}>One grown structure per tree · three looks from style params</div>
      <div style={{ position: "absolute", bottom: 12, left: 16, right: 16, fontSize: 13, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", textAlign: "center" }}>
        {STYLES.map((style) => (
          <span key={style.label}>{style.label}</span>
        ))}
      </div>
    </div>
  ),
  capture: {
    views: {
      maples: { look: "0,11,0", lookFrom: "62,10,0" },
      pines: { look: "150,12,0", lookFrom: "62,10,0" },
    },
  },
};
