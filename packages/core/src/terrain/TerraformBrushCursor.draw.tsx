import * as THREE from "three";

import type { TerraformMode } from "@jgengine/core/terrain/terraform";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { useRef } from "@jgengine/core/ui/jsx";

/** Props for {@link TerraformBrushCursor}: brush centre (or null to hide), height, radius and terraform mode. */
export interface TerraformBrushCursorProps {
  center: readonly [number, number] | null;
  y?: number;
  radius: number;
  mode: TerraformMode;
}

const MODE_COLOR: Record<TerraformMode, string> = {
  raise: "#38bdf8",
  lower: "#fb923c",
  smooth: "#c084fc",
  flatten: "#a3e635",
  noise: "#facc15",
  ramp: "#2dd4bf",
  paint: "#e879f9",
};

/** A ground ring showing where a terraform brush will act, coloured by its mode. */
export function terraformBrushCursorDraw(getProps: () => TerraformBrushCursorProps): EngineDraw {
  let group: THREE.Group | null = null;
  let ring: THREE.Mesh | null = null;
  let fill: THREE.Mesh | null = null;
  let ringMaterial: THREE.MeshBasicMaterial | null = null;
  let fillMaterial: THREE.MeshBasicMaterial | null = null;
  let builtRadius = -1;
  let builtColor = "";
  return {
    mount(state: EngineFrameState) {
      const { radius, mode } = getProps();
      const color = MODE_COLOR[mode];
      ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      fillMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, depthWrite: false });
      ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.15, radius, 48), ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), fillMaterial);
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = -0.02;
      builtRadius = radius;
      builtColor = color;
      group = new THREE.Group();
      group.add(ring, fill);
      group.visible = getProps().center !== null;
      state.scene.add(group);
    },
    frame(_state: EngineFrameState) {
      if (group === null || ring === null || fill === null) return;
      const props = getProps();
      const center = props.center;
      group.visible = center !== null;
      if (center === null) return;
      group.position.set(center[0], props.y ?? 0.05, center[1]);
      const color = MODE_COLOR[props.mode];
      if (color !== builtColor) {
        builtColor = color;
        ringMaterial?.color.set(color);
        fillMaterial?.color.set(color);
      }
      if (props.radius === builtRadius) return;
      builtRadius = props.radius;
      ring.geometry.dispose();
      ring.geometry = new THREE.RingGeometry(props.radius - 0.15, props.radius, 48);
      fill.geometry.dispose();
      fill.geometry = new THREE.CircleGeometry(props.radius, 48);
    },
    dispose(state: EngineFrameState) {
      if (group !== null) state.scene.remove(group);
      ring?.geometry.dispose();
      fill?.geometry.dispose();
      ringMaterial?.dispose();
      fillMaterial?.dispose();
      group = null;
      ring = null;
      fill = null;
      ringMaterial = null;
      fillMaterial = null;
    },
  };
}

export function TerraformBrushCursor(props: TerraformBrushCursorProps) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => terraformBrushCursorDraw(() => latest.current), []);
  return null;
}
