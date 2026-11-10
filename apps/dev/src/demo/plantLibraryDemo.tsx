/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useState } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import { disposeObjectTree, SceneObjectAttach, SceneObjectGroup } from "@jgengine/core/frame/useEngineDraw.draw";
import { AnchoredOverlay } from "@jgengine/core/hud/hudOverlay.draw";
import { AttachedMeshes } from "./drawHelpers";

import { prepareGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import { PLANT_GROWN_GENERATOR } from "@jgengine/core/plants/grown/plantGrown";
import { isPlantMesh, type PlantMesh } from "@jgengine/core/plants/mesh/plantMesh";
import { plantMeshSources } from "@jgengine/core/plants/mesh/plantMesh.draw";
import { PLANT_LIBRARY } from "@jgengine/core/plants/species/data/plantLibrary";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

const PARAMS = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
/** Every library species open-grown to one age (`?age=25` picks another), in rows a capture view frames one at a time. */
const SHEET = { age: Number(PARAMS.get("age") ?? 60) || 60, perRow: 9, spacing: 24, rowGap: 300, detail: 0.5 };
/** `?seed=forest-b` regrows every species from another seed; each plant's seed is `<seed>-<species id>`. */
const SEED = PARAMS.get("seed") ?? "library";

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
  const meshes = useMemo(
    () => sources.map((source) => new THREE.Mesh(source.geometry, source.material)),
    [sources],
  );
  const labelPosition: [number, number, number] = [position[0], position[1] - 0.5, position[2] + 4];
  return (
    <SceneObjectGroup position={position}>
      <AttachedMeshes meshes={meshes} castShadow receiveShadow />
      <AnchoredOverlay position={labelPosition} zIndex={10}>
        <div style={{ color: "#fff", font: "600 11px sans-serif", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{label}</div>
      </AnchoredOverlay>
    </SceneObjectGroup>
  );
}

const rowOf = (index: number): number => Math.floor(index / SHEET.perRow);
const rowX = (row: number): number => row * SHEET.rowGap;

function PlantLibrary() {
  const ground = useMemo(() => {
    const geo = new THREE.PlaneGeometry(rowX(rowOf(PLANT_LIBRARY.length - 1)) + 400, 300);
    geo.rotateX(-Math.PI / 2);
    const groundMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#6b7a4a", roughness: 1 }));
    groundMesh.position.set(rowX(rowOf(PLANT_LIBRARY.length - 1)) / 2, 0, 0);
    groundMesh.receiveShadow = true;
    return groundMesh;
  }, []);
  useEffect(() => () => disposeObjectTree(ground), [ground]);
  return (
    <>
      <SceneObjectAttach object={ground} />
      {PLANT_LIBRARY.map((species, index) => (
        <LibraryTree
          key={species.id}
          species={species.id}
          label={species.names.common["en"] ?? species.id}
          position={[rowX(rowOf(index)) + ((index % SHEET.perRow) - (SHEET.perRow - 1) / 2) * SHEET.spacing, 0, 0]}
        />
      ))}
    </>
  );
}

const views = Object.fromEntries(
  Array.from({ length: rowOf(PLANT_LIBRARY.length - 1) + 1 }, (_, row) => [`row-${row + 1}`, { look: `${rowX(row)},14,0`, lookFrom: "125,12,0" }]),
);

/** A contact sheet of every species in the plant library, open-grown to 60 years, one capture view per row. */
export const plantLibraryGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "plant-library" },
  scene: {
    renderEntity: () => null,
    renderObject: () => null,
    environment: () => <PlantLibrary />,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  rendering: {
    lighting: { ambient: { intensity: 0.6 }, directional: [{ intensity: 2.4, position: [40, 60, 30], color: "#fff1dc" }] },
    backdrop: { background: "#a8c8e0" },
  },
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", top: 12, left: 16, color: "#fff", font: "600 15px sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
      Plant library · every species open-grown to {SHEET.age} years from its fitted record · seed "{SEED}"
    </div>
  ),
  capture: { views },
};
