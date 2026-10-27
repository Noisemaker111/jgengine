import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactElement } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicMaterial, type Mesh } from "three";

import type { TireMark } from "@jgengine/core/physics/tireMarks";
import { useGameContext } from "@jgengine/react/provider";

/** Darkest a fresh mark draws at full strength. */
const MARK_ALPHA = 0.62;
/** Fades are coarse: rebuilding twice a second is invisible and keeps the pool cheap. */
const FADE_REBUILD_SECONDS = 0.5;

/**
 * Write each live mark as a quad (two triangles) into `positions` (xyz) and `colors` (rgba), fading by age.
 * Returns the number of vertices written. @internal
 */
export function writeTireMarkGeometry(marks: readonly TireMark[], time: number, lifetime: number, positions: Float32Array, colors: Float32Array): number {
  const maxQuads = Math.floor(positions.length / 18);
  let quad = 0;
  for (const mark of marks) {
    if (quad >= maxQuads) break;
    const age = time - mark.born;
    const alpha = MARK_ALPHA * mark.strength * Math.max(0, 1 - age / lifetime);
    if (alpha <= 0.01) continue;
    const dx = mark.bx - mark.ax;
    const dz = mark.bz - mark.az;
    const length = Math.hypot(dx, dz);
    if (length <= 0) continue;
    const nx = (-dz / length) * (mark.width / 2);
    const nz = (dx / length) * (mark.width / 2);
    const corners: readonly (readonly [number, number])[] = [
      [mark.ax - nx, mark.az - nz],
      [mark.ax + nx, mark.az + nz],
      [mark.bx + nx, mark.bz + nz],
      [mark.ax - nx, mark.az - nz],
      [mark.bx + nx, mark.bz + nz],
      [mark.bx - nx, mark.bz - nz],
    ];
    for (let v = 0; v < 6; v += 1) {
      const p = (quad * 6 + v) * 3;
      const c = (quad * 6 + v) * 4;
      positions[p] = corners[v]![0];
      positions[p + 1] = mark.y;
      positions[p + 2] = corners[v]![1];
      colors[c] = 1;
      colors[c + 1] = 1;
      colors[c + 2] = 1;
      colors[c + 3] = alpha;
    }
    quad += 1;
  }
  return quad * 6;
}

/** Draws `ctx.tireMarks` as one batched, fading mesh on the ground. Mounted by the 3D shell for every game. @internal */
export function WorldTireMarks(): ReactElement {
  const ctx = useGameContext();
  const store = ctx.tireMarks;
  const mesh = useRef<Mesh>(null);
  const seen = useRef({ version: -1, rebuiltAt: -Infinity });
  const { geometry, material, positions, colors } = useMemo(() => {
    const vertices = store.capacity * 6;
    const positions = new Float32Array(vertices * 3);
    const colors = new Float32Array(vertices * 4);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 4));
    geometry.setDrawRange(0, 0);
    const material = new MeshBasicMaterial({
      // Rubber is the material colour; the vertex colour only carries each mark's fade.
      color: "#0b0b0c",
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    return { geometry, material, positions, colors };
  }, [store]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    const now = ctx.time.now();
    const version = store.version();
    if (version === seen.current.version && now - seen.current.rebuiltAt < FADE_REBUILD_SECONDS) return;
    seen.current = { version, rebuiltAt: now };
    const count = writeTireMarkGeometry(store.marks(now), now, store.lifetime, positions, colors);
    geometry.setDrawRange(0, count);
    geometry.attributes["position"]!.needsUpdate = true;
    geometry.attributes["color"]!.needsUpdate = true;
    geometry.computeBoundingSphere();
    if (mesh.current !== null) mesh.current.visible = count > 0;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={1} visible={false} />;
}
