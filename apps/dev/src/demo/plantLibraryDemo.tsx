import { Html } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";

import { prepareGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import { PLANT_GROWN_GENERATOR } from "@jgengine/core/plants/grown/plantGrown";
import { isPlantMesh, type PlantMesh } from "@jgengine/core/plants/mesh/plantMesh";
import { plantMeshSources } from "@jgengine/core/plants/mesh/plantMesh.draw";
import { PLANT_LIBRARY } from "@jgengine/core/plants/species/data/plantLibrary";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

/** Every library species open-grown to one age, in rows a capture view frames one at a time. */
const SHEET = { age: 60, perRow: 9, spacing: 24, rowGap: 300, detail: 0.5 };
/** `?seed=forest-b` regrows every species from another seed; each plant's seed is `<seed>-<species id>`. */
const SEED = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("seed") ?? "library";

function LibraryTree({ species, label, position }: { species: string; label: string; position: [number, number, number] }) {
  const [mesh, setMesh] = useState<PlantMesh | null>(null);
  const meta = useMemo(() => ({ species, age: SHEET.age, seed: `${SEED}-${species}`, foliage: "leaves", shading: "lit", barkGrain: true }), [species]);
  useEffect(() => {
    let live = true;
    const done = trackSceneWork(`plant-library:${species}`);
    prepareGenerator(PLANT_GROWN_GENERATOR, meta, { detail: SHEET.detail })
      .then(() => {
        const output = runGenerator(PLANT_GROWN_GENERATOR, meta, { detail: SHEET.detail });
        if (live && isPlantMesh(output)) setMesh(output);
      })
      .finally(done);
    return () => {
      live = false;
    };
  }, [meta, species]);
  const sources = useMemo(() => (mesh === null ? [] : plantMeshSources(mesh)), [mesh]);
  useEffect(() => () => sources.forEach((source) => source.geometry.dispose()), [sources]);
  return (
    <group position={position}>
      {sources.map((source, index) => (
        <mesh key={index} geometry={source.geometry} material={source.material} castShadow receiveShadow />
      ))}
      <Html position={[0, -0.5, 4]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div style={{ color: "#fff", font: "600 11px sans-serif", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{label}</div>
      </Html>
    </group>
  );
}

const rowOf = (index: number): number => Math.floor(index / SHEET.perRow);
const rowX = (row: number): number => row * SHEET.rowGap;

function PlantLibrary() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[rowX(rowOf(PLANT_LIBRARY.length - 1)) / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[rowX(rowOf(PLANT_LIBRARY.length - 1)) + 400, 300]} />
        <meshStandardMaterial color="#6b7a4a" roughness={1} />
      </mesh>
      {PLANT_LIBRARY.map((species, index) => (
        <LibraryTree
          key={species.id}
          species={species.id}
          label={species.names.common["en"] ?? species.id}
          position={[rowX(rowOf(index)) + ((index % SHEET.perRow) - (SHEET.perRow - 1) / 2) * SHEET.spacing, 0, 0]}
        />
      ))}
    </group>
  );
}

const views = Object.fromEntries(
  Array.from({ length: rowOf(PLANT_LIBRARY.length - 1) + 1 }, (_, row) => [`row-${row + 1}`, { look: `${rowX(row)},14,0`, lookFrom: "125,12,0" }]),
);

/** A contact sheet of every species in the plant library, open-grown to 60 years, one capture view per row. */
export const plantLibraryGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "plant-library" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  lighting: { ambient: { intensity: 0.6 }, directional: [{ intensity: 2.4, position: [40, 60, 30], color: "#fff1dc" }] },
  backdrop: { background: "#a8c8e0" },
  environment: () => <PlantLibrary />,
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", top: 12, left: 16, color: "#fff", font: "600 15px sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
      Plant library · every species open-grown to {SHEET.age} years from its fitted record · seed "{SEED}"
    </div>
  ),
  capture: { views },
};
