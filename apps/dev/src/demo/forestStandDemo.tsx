import { useEffect, useMemo } from "react";
import { Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, SphereGeometry, Vector3 } from "three";
import { disposeObjectTree, SceneObjectAttach } from "@jgengine/core/frame/useEngineDraw.draw";
import { AnchoredOverlay } from "@jgengine/core/hud/hudOverlay.draw";

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
  const rig = useMemo(() => {
    const root = new Group();
    const count = Math.max(1, trees.length);
    const trunks = new InstancedMesh(new CylinderGeometry(0.5, 0.5, 1, 6), new MeshStandardMaterial({ color: "#6b5a4a", roughness: 1 }), count);
    trunks.frustumCulled = false;
    trunks.castShadow = true;
    const crowns = new InstancedMesh(new SphereGeometry(1, 10, 8), new MeshStandardMaterial({ roughness: 0.9 }), count);
    crowns.frustumCulled = false;
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    const matrix = new Matrix4();
    const turn = new Quaternion();
    const color = new Color();
    trees.forEach((tree, index) => {
      const crownLength = Math.max(0.5, tree.heightM * tree.crownRatio);
      const trunkTop = tree.heightM - crownLength * 0.5;
      matrix.compose(new Vector3(offsetX + tree.x - 50, trunkTop / 2, tree.z - 50), turn, new Vector3(tree.dbhCm / 100, trunkTop, tree.dbhCm / 100));
      trunks.setMatrixAt(index, matrix);
      matrix.compose(new Vector3(offsetX + tree.x - 50, tree.heightM - crownLength / 2, tree.z - 50), turn, new Vector3(tree.crownRadiusM, crownLength / 2, tree.crownRadiusM));
      crowns.setMatrixAt(index, matrix);
      crowns.setColorAt(index, color.set(CROWN_COLORS[tree.species] ?? "#557744"));
    });
    trunks.count = trees.length;
    crowns.count = trees.length;
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor !== null) crowns.instanceColor.needsUpdate = true;
    root.add(trunks, crowns);
    return root;
  }, [trees, offsetX]);
  useEffect(() => () => disposeObjectTree(rig), [rig]);
  return (
    <>
      <SceneObjectAttach object={rig} />
      <AnchoredOverlay position={[offsetX, 0, 56]} zIndex={10}>
        <div style={{ color: "#fff", font: "600 14px sans-serif", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{label}</div>
      </AnchoredOverlay>
    </>
  );
}

function ForestStand() {
  const stands = useMemo(standsAtAges, []);
  const ground = useMemo(() => {
    const geo = new PlaneGeometry(GAP_M * AGES.length + 60, 160);
    geo.rotateX(-Math.PI / 2);
    const groundMesh = new Mesh(geo, new MeshStandardMaterial({ color: "#5d6a3e", roughness: 1 }));
    groundMesh.receiveShadow = true;
    return groundMesh;
  }, []);
  useEffect(() => () => disposeObjectTree(ground), [ground]);
  return (
    <>
      <SceneObjectAttach object={ground} />
      {stands.map((trees, index) => (
        <Plot key={AGES[index]} trees={trees} offsetX={(index - 1) * GAP_M} label={`${AGES[index]} years Â· ${trees.length} trees`} />
      ))}
    </>
  );
}

/** A cleared hectare growing back: pioneers first, then sugar maple, at 30, 100 and 200 years. */
export const forestStandGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "forest-stand" },
  scene: {
    renderEntity: () => null,
    renderObject: () => null,
    environment: () => <ForestStand />,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  rendering: {
    lighting: { ambient: { intensity: 0.6 }, directional: [{ intensity: 2.4, position: [60, 90, 40], color: "#fff1dc" }] },
    backdrop: { background: "#a8c8e0" },
  },
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", top: 12, left: 16, color: "#fff", font: "600 15px sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
      Forest stand · sugar maple (dark green), paper birch (pale), aspen (yellow-green)
    </div>
  ),
  capture: { views: { overview: { look: "0,8,0", lookFrom: "170,210,0" } } },
};
