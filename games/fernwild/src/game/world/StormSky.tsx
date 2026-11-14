/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import { stormView } from "../creatures";

/** How strongly the broadcast tints the sky at full storm, and how fast it fades in and out (per second). */
const TINT = 0.16;
const FADE = 0.35;

/**
 * A Signal Storm in the sky: a magenta veil fades over everything around the camera while the broadcast
 * runs, and the air flashes with the Root Server's discharge every few seconds. Nothing draws on a calm night.
 */
export function stormSkyDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const veil = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 12),
    new THREE.MeshBasicMaterial({ color: "#c43cff", transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }),
  );
  veil.renderOrder = 999;
  veil.frustumCulled = false;
  const flash = new THREE.HemisphereLight("#e7a6ff", "#3a1050", 0);
  let strength = 0;
  let nextFlash = 3;
  let flashLeft = 0;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(veil, flash);
    },
    frame(state, delta) {
      const on = stormView(ctx).storm;
      strength = Math.max(0, Math.min(1, strength + (on ? FADE : -FADE) * delta));
      const material = veil.material as THREE.MeshBasicMaterial;
      material.opacity = strength * TINT;
      veil.visible = strength > 0;
      veil.position.copy(state.camera.position);
      if (strength > 0.5) {
        nextFlash -= delta;
        if (nextFlash <= 0) {
          flashLeft = 0.18;
          nextFlash = 3 + Math.random() * 6;
        }
      }
      flashLeft = Math.max(0, flashLeft - delta);
      flash.intensity = flashLeft > 0 ? 2.5 * strength : 0;
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(veil, flash);
      veil.geometry.dispose();
      (veil.material as THREE.Material).dispose();
    },
  };
}

export function StormSky({ ctx }: WorldOverlayProps) {
  const latest = useRef(ctx);
  latest.current = ctx;
  useEngineDraw(() => stormSkyDraw(latest.current), []);
  return null;
}
