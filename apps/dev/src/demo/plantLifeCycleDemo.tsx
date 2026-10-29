import { Html } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";

import { prepareGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import { PLANT_GROWN_GENERATOR } from "@jgengine/core/plants/grown/plantGrown";
import { isPlantMesh, type PlantMesh } from "@jgengine/core/plants/mesh/plantMesh";
import { plantMeshSources } from "@jgengine/core/plants/mesh/plantMesh.draw";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

const SPACING = 22;
const ROW_GAP = 40;
const DETAIL = 0.5;
/** `?seed=forest-b` grows every plant here from another seed. */
const SEED = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("seed") ?? "life-cycle";
/** One 40-year sugar maple through a year, the same tree standing dead and falling apart, then a blueberry clump. */
const ROWS: { label: string; meta: Record<string, number | string> }[][] = [
  [
    { label: "Day 15 · bare", meta: { day: 15 } },
    { label: "Day 140 · leaves out", meta: { day: 140 } },
    { label: "Day 200 · full leaf", meta: { day: 200 } },
    { label: "Day 268 · autumn", meta: { day: 268 } },
  ],
  [
    { label: "Dead 1 year", meta: { deadYears: 1 } },
    { label: "Dead 6 years", meta: { deadYears: 6 } },
    { label: "Dead 14 years", meta: { deadYears: 14 } },
    { label: "Dead 24 years", meta: { deadYears: 24 } },
  ],
  [
    { label: "Blueberry 3 y", meta: { species: "vaccinium-corymbosum", age: 3, day: 200 } },
    { label: "6 y · flowers", meta: { species: "vaccinium-corymbosum", age: 6, day: 150 } },
    { label: "12 y · berries", meta: { species: "vaccinium-corymbosum", age: 12, day: 215 } },
    { label: "25 y · autumn", meta: { species: "vaccinium-corymbosum", age: 25, day: 268 } },
  ],
  [
    { label: "Coconut 20 y", meta: { species: "cocos-nucifera", age: 20 } },
    { label: "Cabbage palm 25 y", meta: { species: "sabal-palmetto", age: 25 } },
    { label: "Tree fern 25 y", meta: { species: "cibotium-glaucum", age: 25 } },
    { label: "Bracken 6 y", meta: { species: "pteridium-aquilinum", age: 6 } },
    { label: "Sword fern 8 y", meta: { species: "polystichum-munitum", age: 8 } },
  ],
];
/** Shrubs stand closer together than the trees, off to one side so the trees stay out of frame. */
const SHRUB_ROW = 2;
const SHRUB_SPACING = 5;
const SHRUB_X = 120;
/** Palms and ferns stand off to the other side. */
const PALM_ROW = 3;
const PALM_SPACING = 9;
const PALM_X = -120;

function Tree({ meta, label, position }: { meta: Record<string, number | string>; label: string; position: [number, number, number] }) {
  const [mesh, setMesh] = useState<PlantMesh | null>(null);
  const params = useMemo(() => ({ species: "acer-saccharum", age: 40, seed: SEED, foliage: "leaves", shading: "lit", barkGrain: true, ...meta }), [meta]);
  useEffect(() => {
    let live = true;
    const done = trackSceneWork(`plant-life-cycle:${label}`);
    prepareGenerator(PLANT_GROWN_GENERATOR, params, { detail: DETAIL })
      .then(() => {
        const output = runGenerator(PLANT_GROWN_GENERATOR, params, { detail: DETAIL });
        if (live && isPlantMesh(output)) setMesh(output);
      })
      .finally(done);
    return () => {
      live = false;
    };
  }, [params, label]);
  const sources = useMemo(() => (mesh === null ? [] : plantMeshSources(mesh)), [mesh]);
  useEffect(() => () => sources.forEach((source) => source.geometry.dispose()), [sources]);
  return (
    <group position={position}>
      {sources.map((source, index) => (
        <mesh key={index} geometry={source.geometry} material={source.material} castShadow receiveShadow />
      ))}
      <Html position={[0, -0.5, 3]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div style={{ color: "#fff", font: "600 12px sans-serif", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{label}</div>
      </Html>
    </group>
  );
}

const rowZ = (row: number): number => -row * ROW_GAP;

function LifeCycle() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -ROW_GAP / 2]} receiveShadow>
        <planeGeometry args={[400, 160]} />
        <meshStandardMaterial color="#6b7a4a" roughness={1} />
      </mesh>
      {ROWS.map((row, r) =>
        row.map((entry, index) => (
          <Tree key={entry.label} meta={entry.meta} label={entry.label} position={r === SHRUB_ROW ? [SHRUB_X + (index - (row.length - 1) / 2) * SHRUB_SPACING, 0, 0] : r === PALM_ROW ? [PALM_X + (index - (row.length - 1) / 2) * PALM_SPACING, 0, 0] : [(index - (row.length - 1) / 2) * SPACING, 0, rowZ(r)]} />
        )),
      )}
    </group>
  );
}

/** A sugar maple through its year and then as a snag decaying, a blueberry clump growing, and palms and ferns, all from `plant.grown` params. */
export const plantLifeCycleGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "plant-life-cycle" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  lighting: { ambient: { intensity: 0.6 }, directional: [{ intensity: 2.4, position: [40, 60, 30], color: "#fff1dc" }] },
  backdrop: { background: "#a8c8e0" },
  environment: () => <LifeCycle />,
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", top: 12, left: 16, color: "#fff", font: "600 15px sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
      One 40-year sugar maple · its year, then standing dead · a highbush blueberry clump · palms and ferns
    </div>
  ),
  capture: {
    views: {
      seasons: { look: `0,10,${rowZ(0)}`, lookFrom: "60,10,0" },
      snags: { look: `0,10,${rowZ(1)}`, lookFrom: "60,10,3.1416" },
      shrubs: { look: `${SHRUB_X},1.4,0`, lookFrom: "13,3,0" },
      palms: { look: `${PALM_X},7,0`, lookFrom: "42,8,0" },
    },
  },
};
