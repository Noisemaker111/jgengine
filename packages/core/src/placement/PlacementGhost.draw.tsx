/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";

import type { PlacementPreview } from "@jgengine/core/placement/placementController";
import { quarterTurnsToRotationY } from "@jgengine/core/placement/placementController";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { useRef } from "@jgengine/core/ui/jsx";

/** Props for {@link PlacementGhost}: the placement preview to draw and its valid/invalid tint. */
export interface PlacementGhostProps {
  preview: PlacementPreview | null;
  height?: number;
  validColor?: string;
  invalidColor?: string;
}

/**
 * Cursor-following build ghost: valid/invalid tint from a placement controller preview.
 * @capability placement-ghost render valid/invalid placement preview mesh
 */
export function placementGhostDraw(getProps: () => PlacementGhostProps): EngineDraw {
  const group = new THREE.Group();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const boxMaterial = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.35, depthWrite: false, emissiveIntensity: 0.4 });
  const ringGeometry = new THREE.RingGeometry(0.5, 0.62, 40);
  const ringMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 });
  const box = new THREE.Mesh(boxGeometry, boxMaterial);
  box.position.y = 0.5;
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(box, ring);
  group.visible = false;
  let built: { w: number; d: number; height: number; color: string } | null = null;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame(_state: EngineFrameState) {
      const { preview, height = 1, validColor = "#34d399", invalidColor = "#f87171" } = getProps();
      group.visible = preview !== null;
      if (preview === null) return;
      const color = preview.valid ? validColor : invalidColor;
      const w = preview.footprint?.w ?? 1;
      const d = preview.footprint?.d ?? 1;
      if (built === null || built.w !== w || built.d !== d || built.height !== height || built.color !== color) {
        built = { w, d, height, color };
        box.geometry.dispose();
        box.geometry = new THREE.BoxGeometry(w, height, d);
        const outer = Math.max(w, d) * 0.5;
        ring.geometry.dispose();
        ring.geometry = new THREE.RingGeometry(outer, outer + 0.12, 40);
        box.position.y = height / 2;
        boxMaterial.color.set(color);
        boxMaterial.emissive.set(color);
        ringMaterial.color.set(color);
      }
      group.position.set(preview.center[0], preview.y, preview.center[1]);
      group.rotation.y = quarterTurnsToRotationY(preview.quarterTurns);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      box.geometry.dispose();
      ring.geometry.dispose();
      boxMaterial.dispose();
      ringMaterial.dispose();
    },
  };
}

export function PlacementGhost(props: PlacementGhostProps) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => placementGhostDraw(() => latest.current), []);
  return null;
}
