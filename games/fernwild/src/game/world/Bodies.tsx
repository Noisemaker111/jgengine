/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { childFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { lightBeamDraw } from "@jgengine/core/map/LightBeam.draw";

import { bodies } from "../deathBody";

/** Fallen survivors' bodies: a bundle where they fell and a pale beam of light above it to find it by. */
export function bodiesDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const group = new THREE.Group();
  const geometry = new THREE.DodecahedronGeometry(0.5, 0);
  const material = new THREE.MeshStandardMaterial({ color: "#6b4a2f", roughness: 0.95, flatShading: true });
  const beams: EngineDraw[] = [];
  let drawn = "";
  const rebuild = (state: EngineFrameState) => {
    const list = bodies(ctx);
    const key = list.map((body) => body.id).join(",");
    if (key === drawn) return;
    drawn = key;
    for (const beam of beams.splice(0)) beam.dispose?.(childFrameState(state, group));
    group.clear();
    for (const body of list) {
      const holder = new THREE.Group();
      holder.position.set(body.at[0], body.at[1], body.at[2]);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 0.25;
      mesh.scale.set(1, 0.55, 0.8);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      holder.add(mesh);
      const beam = lightBeamDraw({});
      const beamState = childFrameState(state, holder);
      beam.mount?.(beamState);
      beams.push(beam);
      group.add(holder);
    }
  };
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      rebuild(state);
    },
    frame(state: EngineFrameState) {
      rebuild(state);
    },
    dispose(state: EngineFrameState) {
      for (const beam of beams.splice(0)) beam.dispose?.(childFrameState(state, group));
      state.scene.remove(group);
      geometry.dispose();
      material.dispose();
    },
  };
}

export function Bodies({ ctx }: WorldOverlayProps) {
  const latest = useRef(ctx);
  latest.current = ctx;
  useEngineDraw(() => bodiesDraw(latest.current), []);
  return null;
}
