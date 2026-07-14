import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { EditorSession } from "@jgengine/core/editor/index";
import { editableTerrainFromSnapshot } from "@jgengine/core/world/terraform";
import { resolveScatter, type ScatterInstance, type ScatterTerrain } from "@jgengine/core/world/scatterRegion";
import { useGameContext } from "@jgengine/react/provider";

import type { EditorHostApi } from "./session";

const MAX_INSTANCES = 20000;

const ITEM_COLORS: Record<string, string> = {
  grass: "#5f9a3c",
  tree: "#2f5d2a",
  pine: "#274d29",
  oak: "#3a6b30",
  bush: "#4a7a38",
  shrub: "#4a7a38",
  rock: "#8a8a8d",
  stone: "#7c7f86",
};

function itemColor(item: string): string {
  return ITEM_COLORS[item] ?? "#5f9a3c";
}

/**
 * Deterministic instanced preview of every foliage/scatter region in the document, grounded on the
 * sculpt terrain (or the game's ground) and rebuilt whenever a region or its density changes. One
 * GPU-instanced draw for the whole field — never one node per placement.
 * @internal — mounted by `EditorApp`; not a game-author entry point.
 */
export function ScatterPreview({ api }: { api: EditorHostApi }) {
  const ctx = useGameContext();
  const session: EditorSession = api.getSession();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [, setTick] = useState(0);
  useEffect(() => session.subscribe(() => setTick((value) => value + 1)), [session]);

  const state = session.getState();
  const snapshot = state.document.terrain ?? null;
  const baseGround = ctx.world.ground;

  const terrain = useMemo<ScatterTerrain>(() => {
    if (snapshot !== null) return editableTerrainFromSnapshot(snapshot, baseGround);
    return { sampleHeight: baseGround.sampleHeight, sampleNormal: baseGround.sampleNormal };
  }, [snapshot, baseGround]);

  const instances = useMemo<ScatterInstance[]>(
    () => resolveScatter(state.document, terrain).slice(0, MAX_INSTANCES),
    [state.document, terrain],
  );

  const geometry = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.35, 1.4, 6);
    geo.translate(0, 0.7, 0);
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < instances.length; i += 1) {
      const instance = instances[i]!;
      position.set(instance.x, instance.y, instance.z);
      euler.set(0, instance.rotationY, 0);
      quaternion.setFromEuler(euler);
      scale.set(instance.scale, instance.scale, instance.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color.set(itemColor(instance.item)));
    }
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances]);

  if (instances.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, MAX_INSTANCES]} frustumCulled={false}>
      <meshStandardMaterial vertexColors={false} roughness={0.85} metalness={0} />
    </instancedMesh>
  );
}
