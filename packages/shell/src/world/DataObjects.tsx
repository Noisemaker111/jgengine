import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import { useDisposable } from "../render/useDisposable";

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

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function DataObjects<T>({
  data,
  position,
  height,
  color,
  cellSize = 0.28,
  hovered = null,
  hoverColor = "#ffffff",
  onHover,
  grow,
  castShadow = true,
  receiveShadow = true,
  renderItem,
}: DataObjectsProps<T>) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useDisposable(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useDisposable(() => new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.04 }), []);
  const hover = useMemo(() => new THREE.Color(hoverColor), [hoverColor]);
  const startRef = useRef<number | null>(null);

  const capacity = data.length;
  const layout = useMemo(() => {
    const positions = new Float32Array(capacity * 2);
    const targets = new Float32Array(capacity);
    const delays = new Float32Array(capacity);
    const colors: THREE.Color[] = [];
    data.forEach((item, i) => {
      const [x, z] = position(item, i);
      positions[i * 2] = x;
      positions[i * 2 + 1] = z;
      targets[i] = height(item, i);
      delays[i] = grow?.delay?.(item, i) ?? 0;
      colors.push(new THREE.Color(color(item, i)));
    });
    return { positions, targets, delays, colors };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    startRef.current = null;
  }, [data]);

  const duration = grow?.duration ?? 0;

  useFrame((state) => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    if (startRef.current === null) startRef.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startRef.current;
    const { positions, targets, delays, colors } = layout;

    for (let i = 0; i < capacity; i += 1) {
      const grown = duration <= 0 ? 1 : clamp01((elapsed - delays[i]!) / duration);
      const eased = 1 - Math.pow(1 - grown, 3);
      const h = Math.max(targets[i]! * eased, 0.001);
      dummy.position.set(positions[i * 2]!, h / 2, positions[i * 2 + 1]!);
      dummy.scale.set(cellSize, h, cellSize);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, i === hovered ? hover : colors[i]!);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  });

  function handleMove(event: ThreeEvent<PointerEvent>): void {
    if (onHover === undefined) return;
    event.stopPropagation();
    onHover(event.instanceId ?? null);
  }

  if (renderItem !== undefined) {
    return (
      <group>
        {data.map((item, i) => {
          const [x, z] = position(item, i);
          return (
            <group key={i} position={[x, 0, z]}>
              {renderItem(item, i, { x, z, height: height(item, i) })}
            </group>
          );
        })}
      </group>
    );
  }

  if (capacity === 0) return null;

  return (
    <instancedMesh
      key={capacity}
      ref={meshRef}
      args={[geometry, material, capacity]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
      onPointerMove={onHover === undefined ? undefined : handleMove}
      onPointerOut={onHover === undefined ? undefined : () => onHover(null)}
    />
  );
}
