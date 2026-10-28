import { Html } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";

import { ACER_SACCHARUM } from "@jgengine/core/plants/species/data/acerSaccharum";
import { BETULA_PAPYRIFERA } from "@jgengine/core/plants/species/data/betulaPapyrifera";
import { POPULUS_TREMULOIDES } from "@jgengine/core/plants/species/data/populusTremuloides";
import { createStand, type StandOptions, type StandTree } from "@jgengine/core/plants/stand/standSim";
import type { PlayableGame } from "@jgengine/shell/registry";

import { demoGame } from "./demoGame";

/** One cleared hectare seeded by sugar maple, paper birch and aspen, read at three ages. */
const PLOT: StandOptions = { species: [ACER_SACCHARUM, BETULA_PAPYRIFERA, POPULUS_TREMULOIDES], sizeM: 100, seed: "demo", immigrationPerHa: 2000 };
const AGES = [30, 100, 200] as const;
const GAP_M = 130;
/** Crowns tinted apart so the species read at a glance: maple green, birch pale, aspen yellow-green. */
const CROWN_COLORS = ["#2f6b2a", "#a9c79a", "#b8c43a"];

function standsAtAges(): StandTree[][] {
  const stand = createStand(PLOT);
  return AGES.map((age) => {
    stand.step(age - stand.year());
    return stand.trees().filter((tree) => tree.dbhCm >= 1);
  });
}

function Plot({ trees, offsetX, label }: { trees: StandTree[]; offsetX: number; label: string }) {
  const trunks = useRef<InstancedMesh>(null);
  const crowns = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const matrix = new Matrix4();
    const turn = new Quaternion();
    const color = new Color();
    trees.forEach((tree, index) => {
      const crownLength = Math.max(0.5, tree.heightM * tree.crownRatio);
      const trunkTop = tree.heightM - crownLength * 0.5;
      matrix.compose(new Vector3(offsetX + tree.x - 50, trunkTop / 2, tree.z - 50), turn, new Vector3(tree.dbhCm / 100, trunkTop, tree.dbhCm / 100));
      trunks.current?.setMatrixAt(index, matrix);
      matrix.compose(new Vector3(offsetX + tree.x - 50, tree.heightM - crownLength / 2, tree.z - 50), turn, new Vector3(tree.crownRadiusM, crownLength / 2, tree.crownRadiusM));
      crowns.current?.setMatrixAt(index, matrix);
      crowns.current?.setColorAt(index, color.set(CROWN_COLORS[tree.species] ?? "#557744"));
    });
    for (const mesh of [trunks.current, crowns.current]) {
      if (mesh === null) continue;
      mesh.count = trees.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    }
  }, [trees, offsetX]);
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, Math.max(1, trees.length)]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 1, 6]} />
        <meshStandardMaterial color="#6b5a4a" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, Math.max(1, trees.length)]} frustumCulled={false} castShadow receiveShadow>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <Html position={[offsetX, 0, 56]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div style={{ color: "#fff", font: "600 14px sans-serif", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{label}</div>
      </Html>
    </group>
  );
}

function ForestStand() {
  const stands = useMemo(standsAtAges, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[GAP_M * AGES.length + 60, 160]} />
        <meshStandardMaterial color="#5d6a3e" roughness={1} />
      </mesh>
      {stands.map((trees, index) => (
        <Plot key={AGES[index]} trees={trees} offsetX={(index - 1) * GAP_M} label={`${AGES[index]} years · ${trees.length} trees`} />
      ))}
    </group>
  );
}

/** A cleared hectare growing back: pioneers first, then sugar maple, at 30, 100 and 200 years. */
export const forestStandGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "forest-stand" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  lighting: { ambient: { intensity: 0.6 }, directional: [{ intensity: 2.4, position: [60, 90, 40], color: "#fff1dc" }] },
  backdrop: { background: "#a8c8e0" },
  environment: () => <ForestStand />,
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", top: 12, left: 16, color: "#fff", font: "600 15px sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
      Forest stand · sugar maple (dark green), paper birch (pale), aspen (yellow-green)
    </div>
  ),
  capture: { views: { overview: { look: "0,8,0", lookFrom: "170,210,0" } } },
};
