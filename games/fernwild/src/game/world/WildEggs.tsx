/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import { eggsOnGround } from "../eggs";

/** Egg size by its item id: an extra-small dodo egg to an extra-large one. */
const SIZE: Readonly<Record<string, number>> = { egg_xs: 0.09, egg_s: 0.12, egg_m: 0.16, egg_l: 0.21, egg_xl: 0.28 };

/** Wild eggs lying where their mothers left them: pale speckled ovals on the ground. */
export function wildEggsDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 14, 10);
  const material = new THREE.MeshStandardMaterial({ color: "#efe6cf", roughness: 0.7 });
  let drawn = "";
  const rebuild = () => {
    const eggs = eggsOnGround(ctx);
    const key = eggs.map((egg) => egg.id).join(",");
    if (key === drawn) return;
    drawn = key;
    group.clear();
    for (const egg of eggs) {
      const r = SIZE[egg.item] ?? 0.15;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(egg.at[0], egg.at[1] + r * 1.2, egg.at[2]);
      mesh.scale.set(1, 1.3, 1);
      mesh.castShadow = true;
      group.add(mesh);
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

export function WildEggs({ ctx }: WorldOverlayProps) {
  const latest = useRef(ctx);
  latest.current = ctx;
  useEngineDraw(() => wildEggsDraw(latest.current), []);
  return null;
}
