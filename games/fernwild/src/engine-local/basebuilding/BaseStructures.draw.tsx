import { useRef } from "react";
import * as THREE from "three";

import type { BaseBuilding, StructurePlan, StructureWorldBox } from "./baseBuilding";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";

/** Props for {@link BaseStructures}. */
export interface BaseStructuresProps {
  building: BaseBuilding;
  /** Base colour of a piece, usually by tier. */
  colorOf: (pieceId: string) => string;
  /** The build ghost to show this frame, read every frame. */
  ghost?: () => StructurePlan | null;
  validColor?: string;
  invalidColor?: string;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

function boxMesh(box: StructureWorldBox, material: THREE.Material, solid = true): THREE.Mesh {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.position.set(box.center[0], box.center[1], box.center[2]);
  mesh.rotation.y = box.rotationY;
  mesh.scale.set(box.halfExtents[0] * 2, box.halfExtents[1] * 2, box.halfExtents[2] * 2);
  mesh.castShadow = solid;
  mesh.receiveShadow = solid;
  return mesh;
}

/**
 * The whole base-building model as one draw: placed pieces as their solid boxes, darkened as they
 * lose health, plus the build ghost tinted valid or invalid. Version and ghost polling run inside
 * `frame`, so neither ever costs a React render.
 *
 * @capability base-structures-draw render placed base pieces and the snap build ghost
 */
function baseStructuresDraw(getProps: () => BaseStructuresProps): EngineDraw {
  const group = new THREE.Group();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const ghostMaterial = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4, depthWrite: false, emissiveIntensity: 0.5 });
  let version = -1;
  let planKey = "";
  let plan: StructurePlan | null = null;
  const pieceMeshes: THREE.Mesh[] = [];
  const ghostMeshes: THREE.Mesh[] = [];

  const materialFor = (color: string): THREE.MeshStandardMaterial => {
    let material = materials.get(color);
    if (material === undefined) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
      materials.set(color, material);
    }
    return material;
  };

  const clearMeshes = (meshes: THREE.Mesh[]) => {
    for (const mesh of meshes) group.remove(mesh);
    meshes.length = 0;
  };

  const syncPieces = (props: BaseStructuresProps) => {
    const { building, colorOf } = props;
    clearMeshes(pieceMeshes);
    for (const piece of building.list()) {
      const max = building.piece(piece.pieceId)?.health ?? piece.health;
      const ratio = max > 0 ? piece.health / max : 1;
      // Quantised so a chipped wall reuses a handful of materials instead of one per hit point.
      const shade = 0.55 + 0.45 * Math.round(ratio * 4) / 4;
      const color = `#${new THREE.Color(colorOf(piece.pieceId)).multiplyScalar(shade).getHexString()}`;
      const material = materialFor(color);
      for (const box of building.worldBoxes(piece)) pieceMeshes.push(boxMesh(box, material));
    }
    for (const mesh of pieceMeshes) group.add(mesh);
  };

  const syncGhost = (props: BaseStructuresProps) => {
    const { building, ghost, validColor = "#34d399", invalidColor = "#f87171" } = props;
    const next = ghost?.() ?? null;
    const key = next === null ? "" : `${next.pieceId}|${next.position.map((value) => value.toFixed(2)).join(",")}|${next.rotationY.toFixed(3)}|${next.valid}`;
    if (key === planKey) return;
    planKey = key;
    plan = next;
    clearMeshes(ghostMeshes);
    if (plan === null) return;
    const tint = plan.valid === true ? validColor : invalidColor;
    ghostMaterial.color.set(tint);
    ghostMaterial.emissive.set(tint);
    for (const box of building.worldBoxes(plan)) ghostMeshes.push(boxMesh(box, ghostMaterial, false));
    for (const mesh of ghostMeshes) group.add(mesh);
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame() {
      const props = getProps();
      const now = props.building.version();
      if (now !== version) {
        version = now;
        syncPieces(props);
      }
      syncGhost(props);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      pieceMeshes.length = 0;
      ghostMeshes.length = 0;
      ghostMaterial.dispose();
      for (const material of materials.values()) material.dispose();
      materials.clear();
    },
  };
}

export function BaseStructures(props: BaseStructuresProps) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => baseStructuresDraw(() => latest.current), []);
  return null;
}
