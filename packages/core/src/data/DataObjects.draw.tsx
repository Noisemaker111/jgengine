// @skill jgengine-gameplay
import { useRef, type ReactNode } from "react";
import * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { clamp01 } from "../math/scalar";

/**
 * Renders one placed 3D object per data item — a 3D bar chart, a heatmap, a city
 * of buildings, a crowd. By default each item is an extruded box (all boxes share
 * one `InstancedMesh`, so hundreds cost one draw call), sized and colored from the
 * item; `renderItem` swaps the box for arbitrary content (a sprite, a GLB, a full
 * entity). Genre-agnostic: the caller owns the data `T`, this owns the placement.
 */
export interface DataObjectsProps<T> {
  data: readonly T[];
  /** World `[x, z]` for an item (placed on the ground plane). */
  position: (item: T, index: number) => readonly [number, number];
  /** Box height (Y-scale) for an item. */
  height: (item: T, index: number) => number;
  /** Box color for an item (any CSS/hex/THREE color). */
  color: (item: T, index: number) => THREE.ColorRepresentation;
  /** Footprint on X and Z. Default 0.28. */
  cellSize?: number;
  /** Index of the highlighted item, painted with `hoverColor`. */
  hovered?: number | null;
  hoverColor?: THREE.ColorRepresentation;
  /** Called with the item index under the pointer, or null on exit. */
  onHover?: (index: number | null) => void;
  /** Staggered grow-in; restarts whenever `data` identity changes. */
  grow?: { duration?: number; delay?: (item: T, index: number) => number };
  castShadow?: boolean;
  receiveShadow?: boolean;
  /**
   * Render arbitrary content per item instead of an instanced box — a sprite, a
   * GLB, a full entity. The layout positions each on the ground at its `[x, z]`
   * and hands you the resolved `height` to size against (e.g. one walking figure
   * per unit of value). When set, the instanced-box path is bypassed.
   */
  renderItem?: (item: T, index: number, info: { x: number; z: number; height: number }) => ReactNode;
}

interface BoxLayout {
  positions: Float32Array;
  targets: Float32Array;
  delays: Float32Array;
  colors: THREE.Color[];
}

function boxLayout<T>(data: readonly T[], props: DataObjectsProps<T>): BoxLayout {
  const capacity = data.length;
  const positions = new Float32Array(capacity * 2);
  const targets = new Float32Array(capacity);
  const delays = new Float32Array(capacity);
  const colors: THREE.Color[] = [];
  data.forEach((item, i) => {
    const [x, z] = props.position(item, i);
    positions[i * 2] = x;
    positions[i * 2 + 1] = z;
    targets[i] = props.height(item, i);
    delays[i] = props.grow?.delay?.(item, i) ?? 0;
    colors.push(new THREE.Color(props.color(item, i)));
  });
  return { positions, targets, delays, colors };
}

/** The instanced-box path as an {@link EngineDraw}; `renderItem` stays on the React wrapper. */
export function dataObjectsDraw<T>(getProps: () => DataObjectsProps<T>, data: readonly T[]): EngineDraw {
  const group = new THREE.Group();
  const layout = boxLayout(data, getProps());
  const capacity = data.length;
  const dummy = new THREE.Object3D();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.04 });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let camera: THREE.Camera | null = null;
  let startedAt: number | null = null;
  let hoverColor = new THREE.Color();
  let lastHoverKey: unknown = null;
  let dom: HTMLElement | null = null;

  const applyProps = (props: DataObjectsProps<T>) => {
    mesh.castShadow = props.castShadow ?? true;
    mesh.receiveShadow = props.receiveShadow ?? true;
  };

  const pick = (event: PointerEvent) => {
    const props = getProps();
    if (props.onHover === undefined || dom === null) return;
    const rect = dom.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    if (camera === null) return;
    raycaster.setFromCamera(ndc, camera);
    mesh.updateWorldMatrix(true, false);
    const hit = raycaster.intersectObject(mesh, false)[0];
    props.onHover(hit?.instanceId ?? null);
  };

  const onPointerMove = (event: PointerEvent) => pick(event);
  const onPointerOut = () => {
    const props = getProps();
    props.onHover?.(null);
  };

  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      applyProps(props);
      group.add(mesh);
      state.scene.add(group);
      camera = state.camera;
      startedAt = null;
      const element: HTMLElement | undefined = state.renderer.domElement;
      dom = typeof element?.addEventListener === "function" ? element : null;
      dom?.addEventListener("pointermove", onPointerMove);
      dom?.addEventListener("pointerout", onPointerOut);
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      applyProps(props);
      camera = state.camera;
      const hoverKey = props.hoverColor ?? "#ffffff";
      if (hoverKey !== lastHoverKey) {
        lastHoverKey = hoverKey;
        hoverColor = new THREE.Color(hoverKey);
      }
      if (startedAt === null) startedAt = state.clock.elapsedTime;
      const elapsed = state.clock.elapsedTime - startedAt;
      const duration = props.grow?.duration ?? 0;
      const { positions, targets, delays, colors } = layout;
      const cellSize = props.cellSize ?? 0.28;
      uploadInstances(
        mesh,
        {
          count: capacity,
          at: (i, out) => {
            const grown = duration <= 0 ? 1 : clamp01((elapsed - delays[i]!) / duration);
            const eased = 1 - Math.pow(1 - grown, 3);
            const h = Math.max(targets[i]! * eased, 0.001);
            dummy.position.set(positions[i * 2]!, h / 2, positions[i * 2 + 1]!);
            dummy.scale.set(cellSize, h, cellSize);
            dummy.updateMatrix();
            out.copy(dummy.matrix);
          },
        },
        { colors: (i, out) => out.copy(i === props.hovered ? hoverColor : colors[i]!), bounds: "none", dynamic: true },
      );
    },
    dispose(state: EngineFrameState) {
      dom?.removeEventListener("pointermove", onPointerMove);
      dom?.removeEventListener("pointerout", onPointerOut);
      dom = null;
      state.scene.remove(group);
      group.clear();
      camera = null;
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Places one 3D object per data item: instanced boxes sized and colored from the item, or custom content per item. */
export function DataObjects<T>(props: DataObjectsProps<T>) {
  const { data, renderItem } = props;
  const latest = useRef<DataObjectsProps<T>>(props);
  latest.current = props;

  if (renderItem !== undefined) {
    return (
      <group>
        {data.map((item, i) => {
          const [x, z] = props.position(item, i);
          return (
            <group key={i} position={[x, 0, z]}>
              {renderItem(item, i, { x, z, height: props.height(item, i) })}
            </group>
          );
        })}
      </group>
    );
  }

  if (data.length === 0) return null;
  return <EngineDrawMount create={() => dataObjectsDraw(() => latest.current, data)} deps={[data]} />;
}
