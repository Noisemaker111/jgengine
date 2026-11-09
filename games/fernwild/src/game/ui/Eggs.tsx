import { useRef } from "react";
import * as THREE from "three";

import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import { eggs } from "../breeding";
import { speciesDef } from "../data/species";

/** A fertilized egg's size by its kind: a dodo's fits a hand, a bronto's is a boulder (approximate). */
function eggSize(species: string): number {
  return 0.18 + Math.min(0.5, (speciesDef(species)?.radius ?? 0.5) * 0.12);
}

/** Fertilized eggs where they were laid: pale and speckled, a faint warm glow while they incubate. */
export function eggsDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 16, 12);
  const material = new THREE.MeshStandardMaterial({ color: "#efe6cf", roughness: 0.7, emissive: "#ffb35c", emissiveIntensity: 0.12 });
  let drawn = "";
  const rebuild = () => {
    const list = eggs(ctx);
    const key = list.map((egg) => egg.id).join(",");
    if (key === drawn) return;
    drawn = key;
    group.clear();
    for (const egg of list) {
      const size = eggSize(egg.species);
      const holder = new THREE.Group();
      holder.position.set(egg.at[0], egg.at[1], egg.at[2]);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = size * 1.25;
      mesh.scale.set(size, size * 1.3, size);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      holder.add(mesh);
      group.add(holder);
    }
  };
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      rebuild();
    },
    frame(_state: EngineFrameState) {
      rebuild();
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      geometry.dispose();
      material.dispose();
    },
  };
}

export function Eggs({ ctx }: WorldOverlayProps) {
  const latest = useRef(ctx);
  latest.current = ctx;
  useEngineDraw(() => eggsDraw(latest.current), []);
  return null;
}
