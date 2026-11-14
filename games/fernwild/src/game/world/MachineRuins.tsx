/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../../editorLayers";
import { fabricatorParts, vineCurves } from "../machineRuins";

/**
 * The colony's rusted fabricators (`fabricator` markers in editor.scene.json): a slab bed under a gantry
 * with its print head still parked, a status lamp that flickers amber, and cable vines draped from the
 * gantry down into the undergrowth. The shapes come from `machineRuins.ts`; this only draws them.
 */
export function machineRuinsDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const group = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const rust = new THREE.MeshStandardMaterial({ color: "#8a4a2a", metalness: 0.55, roughness: 0.75 });
  const steel = new THREE.MeshStandardMaterial({ color: "#5d666e", metalness: 0.7, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2a2d31", metalness: 0.4, roughness: 0.8 });
  const vine = new THREE.MeshStandardMaterial({ color: "#2f3a2a", metalness: 0.2, roughness: 0.9 });
  const lamp = new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: "#ffb347", emissiveIntensity: 2, toneMapped: false });
  const materials = { rust, steel, dark, lamp } as const;
  const lamps: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [box];
  for (const marker of markersOfKind(editorLayers, "fabricator")) {
    const ground = ctx.world.groundHeightAt(marker.position.x, marker.position.z);
    const holder = new THREE.Group();
    holder.position.set(marker.position.x, ground, marker.position.z);
    holder.rotation.y = Number(marker.meta?.["yaw"] ?? 0);
    for (const part of fabricatorParts()) {
      const mesh = new THREE.Mesh(box, materials[part.material]);
      mesh.position.set(...part.center);
      mesh.scale.set(...part.size);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (part.material === "lamp") lamps.push(mesh);
      holder.add(mesh);
    }
    group.add(holder);
    for (const curve of vineCurves(marker, ctx.world.groundHeightAt)) {
      const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve.map((p) => new THREE.Vector3(...p))), 24, 0.09, 5, false);
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, vine);
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
  let clock = 0;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame(_state, delta) {
      // The status lamps stutter like a failing supply.
      clock += delta;
      lamp.emissiveIntensity = 1.2 + 0.9 * Math.max(0, Math.sin(clock * 7.3) * Math.sin(clock * 2.1 + 1));
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      for (const geometry of geometries) geometry.dispose();
      for (const material of [rust, steel, dark, vine, lamp]) material.dispose();
    },
  };
}

export function MachineRuins({ ctx }: WorldOverlayProps) {
  const latest = useRef(ctx);
  latest.current = ctx;
  useEngineDraw(() => machineRuinsDraw(latest.current), []);
  return null;
}
