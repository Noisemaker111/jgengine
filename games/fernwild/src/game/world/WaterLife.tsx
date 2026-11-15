/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

import { SEA_LEVEL } from "../../world";
import { arcFlashes, lampjawLures } from "../creatures";

/** Lures lit at once, nearest first, and how far from the camera they light. */
const MAX_LURES = 6;
const LURE_RANGE = 120;
const MAX_ARCS = 6;

/**
 * The swimmers made visible: each Lampjaw's lure casts violet light on the water with a ring of ripples
 * spreading round it, and an Arcwire's bite throws a jagged flash of lightning from the eel to everything
 * it arced into, lighting the river for a moment.
 */
export function waterLifeDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const group = new THREE.Group();
  const lures: { light: THREE.PointLight; ring: THREE.Mesh }[] = [];
  const ringGeometry = new THREE.RingGeometry(0.9, 1.05, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  for (let i = 0; i < MAX_LURES; i += 1) {
    const light = new THREE.PointLight("#c27bff", 0, 16, 1.6);
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: "#d9b3ff", transparent: true, opacity: 0, depthWrite: false }));
    light.visible = false;
    ring.visible = false;
    group.add(light, ring);
    lures.push({ light, ring });
  }
  const arcMaterial = new THREE.LineBasicMaterial({ color: "#bfe9ff", transparent: true, toneMapped: false });
  const arcs: { line: THREE.LineSegments; flash: THREE.PointLight }[] = [];
  for (let i = 0; i < MAX_ARCS; i += 1) {
    const line = new THREE.LineSegments(new THREE.BufferGeometry(), arcMaterial);
    const flash = new THREE.PointLight("#9fd8ff", 0, 18, 1.4);
    line.visible = false;
    line.frustumCulled = false;
    group.add(line, flash);
    arcs.push({ line, flash });
  }
  let clock = 0;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame(state, delta) {
      clock += delta;
      const eye = state.camera.position;
      const near = lampjawLures(ctx, [eye.x, eye.y, eye.z], LURE_RANGE)
        .sort((a, b) => Math.hypot(a[0] - eye.x, a[2] - eye.z) - Math.hypot(b[0] - eye.x, b[2] - eye.z))
        .slice(0, MAX_LURES);
      lures.forEach(({ light, ring }, index) => {
        const at = near[index];
        light.visible = at !== undefined;
        ring.visible = at !== undefined;
        if (at === undefined) return;
        // The lure bobs a little over the head and flickers like bait.
        light.position.set(at[0], SEA_LEVEL + 1.8 + Math.sin(clock * 2 + index) * 0.15, at[2] + 0.6);
        light.intensity = 30 + 12 * Math.sin(clock * 5.3 + index * 1.7);
        const phase = (clock * 0.6 + index * 0.37) % 1;
        ring.position.set(at[0], SEA_LEVEL + 0.03, at[2]);
        ring.scale.setScalar(1 + phase * 4);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - phase);
      });
      const live = arcFlashes(ctx).slice(-MAX_ARCS);
      arcs.forEach(({ line, flash }, index) => {
        const arc = live[index];
        line.visible = arc !== undefined;
        flash.intensity = 0;
        if (arc === undefined) return;
        // A jagged bolt per target, re-forked every frame so it crackles.
        const points: number[] = [];
        for (const to of arc.to) {
          let previous = [arc.from[0], arc.from[1] + 0.5, arc.from[2]];
          const steps = 7;
          for (let step = 1; step <= steps; step += 1) {
            const t = step / steps;
            const jitter = step === steps ? 0 : 0.6;
            const next = [
              arc.from[0] + (to[0] - arc.from[0]) * t + (Math.random() - 0.5) * jitter,
              arc.from[1] + 0.5 + (to[1] + 1 - arc.from[1] - 0.5) * t + (Math.random() - 0.5) * jitter,
              arc.from[2] + (to[2] - arc.from[2]) * t + (Math.random() - 0.5) * jitter,
            ];
            points.push(...previous, ...next);
            previous = next;
          }
        }
        line.geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
        arcMaterial.opacity = Math.max(0, 1 - arc.age / 0.35);
        flash.position.set(arc.from[0], arc.from[1] + 1.2, arc.from[2]);
        flash.intensity = 60 * arcMaterial.opacity;
      });
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      ringGeometry.dispose();
      arcMaterial.dispose();
      for (const { ring } of lures) (ring.material as THREE.Material).dispose();
      for (const { line } of arcs) line.geometry.dispose();
    },
  };
}

export function WaterLife({ ctx }: WorldOverlayProps) {
  const latest = useRef(ctx);
  latest.current = ctx;
  useEngineDraw(() => waterLifeDraw(latest.current), []);
  return null;
}
