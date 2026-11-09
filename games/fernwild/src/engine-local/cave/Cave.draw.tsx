// @skill jgengine-world
import * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import type { CaveGround, CaveLayout } from "./caveLayout";
import { caveMesh, type CaveMeshPart } from "./caveMesh";

function geometryOf(part: CaveMeshPart): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Colours of a cave's rock: the inside you walk through, the hill outside and the floor underfoot. */
export interface CaveColors {
  inner: string;
  outer: string;
  floor: string;
}

const DEFAULT_COLORS: CaveColors = { inner: "#3a332c", outer: "#6d665c", floor: "#4a4136" };

/**
 * Draw a cave laid out by `caveLayout`: the rock inside and the hill outside, both casting shadow so the
 * tunnel and chamber are dark until the game lights them.
 * @capability cave-draw draw a cave's rock from its layout
 */
export function caveDraw({ layout, ground, colors = DEFAULT_COLORS }: { layout: CaveLayout; ground: CaveGround; colors?: CaveColors | undefined }): EngineDraw {
  const mesh = caveMesh(layout, ground);
  const inner = geometryOf(mesh.inner);
  const outer = geometryOf(mesh.outer);
  const floor = geometryOf(mesh.floor);
  const innerMaterial = new THREE.MeshStandardMaterial({ color: colors.inner, roughness: 0.95, side: THREE.DoubleSide, flatShading: true });
  const outerMaterial = new THREE.MeshStandardMaterial({ color: colors.outer, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  const floorMaterial = new THREE.MeshStandardMaterial({ color: colors.floor, roughness: 1, side: THREE.DoubleSide, flatShading: true });
  const group = new THREE.Group();
  const parts: [THREE.BufferGeometry, THREE.Material, boolean, boolean][] = [
    [inner, innerMaterial, true, true],
    [outer, outerMaterial, true, true],
    [floor, floorMaterial, false, true],
  ];
  for (const [geometry, material, castShadow, receiveShadow] of parts) {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = castShadow;
    object.receiveShadow = receiveShadow;
    group.add(object);
  }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      for (const [geometry] of parts) geometry.dispose();
      innerMaterial.dispose();
      outerMaterial.dispose();
      floorMaterial.dispose();
    },
  };
}

export function Cave(props: { layout: CaveLayout; ground: CaveGround; colors?: CaveColors | undefined }) {
  const { layout, ground, colors } = props;
  useEngineDraw(() => caveDraw({ layout, ground, colors }), [layout, ground, colors]);
  return null;
}
