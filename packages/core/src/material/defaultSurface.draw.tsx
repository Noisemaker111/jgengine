import { type ThreeElements } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

const DETAIL_SIZE = 64;
const DETAIL_REPEAT = 3;
const NORMAL_STRENGTH = 2.2;
const ROUGHNESS_SPREAD = 0.14;

function periodicValueNoise(size: number, cells: number, seed: number): Float32Array {
  const lattice = new Float32Array(cells * cells);
  for (let index = 0; index < lattice.length; index += 1) {
    const h = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    lattice[index] = h - Math.floor(h);
  }
  const at = (cx: number, cy: number): number =>
    lattice[((cy % cells) + cells) % cells * cells + (((cx % cells) + cells) % cells)];
  const field = new Float32Array(size * size);
  const step = cells / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fx = x * step;
      const fy = y * step;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      field[y * size + x] = top * (1 - sy) + bottom * sy;
    }
  }
  return field;
}

function heightField(size: number): Float32Array {
  const coarse = periodicValueNoise(size, 4, 1);
  const medium = periodicValueNoise(size, 8, 7);
  const fine = periodicValueNoise(size, 16, 13);
  const field = new Float32Array(size * size);
  for (let index = 0; index < field.length; index += 1) {
    field[index] = coarse[index] * 0.55 + medium[index] * 0.3 + fine[index] * 0.15;
  }
  return field;
}

let cached: { normal: THREE.DataTexture; roughness: THREE.DataTexture } | null = null;

/**
 * Shared, lazily-built procedural detail maps (a subtle tangent-space normal map plus a
 * roughness-variation map) used by every un-modeled primitive so a flat colored box reads as a
 * surface, not plastic. Pure JS `DataTexture` — no canvas/DOM, so it imports safely under `bun test`.
 * @internal shell-internal default render surface; games never import it.
 */
export function detailMaps(): { normal: THREE.DataTexture; roughness: THREE.DataTexture } {
  if (cached !== null) return cached;
  const size = DETAIL_SIZE;
  const height = heightField(size);
  const sample = (x: number, y: number): number => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  const normalData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (sample(x - 1, y) - sample(x + 1, y)) * NORMAL_STRENGTH;
      const dy = (sample(x, y - 1) - sample(x, y + 1)) * NORMAL_STRENGTH;
      const length = Math.hypot(dx, dy, 1);
      const offset = (y * size + x) * 4;
      normalData[offset] = Math.round((dx / length * 0.5 + 0.5) * 255);
      normalData[offset + 1] = Math.round((dy / length * 0.5 + 0.5) * 255);
      normalData[offset + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      normalData[offset + 3] = 255;
      const rough = Math.round((0.5 + (sample(x, y) - 0.5) * 2 * ROUGHNESS_SPREAD * 0.5) * 255);
      roughnessData[offset] = rough;
      roughnessData[offset + 1] = rough;
      roughnessData[offset + 2] = rough;
      roughnessData[offset + 3] = 255;
    }
  }

  const build = (data: Uint8Array): THREE.DataTexture => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(DETAIL_REPEAT, DETAIL_REPEAT);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  };

  cached = { normal: build(normalData), roughness: build(roughnessData) };
  return cached;
}

/**
 * Props for {@link DefaultSurface}: a required base `color` plus optional PBR overrides.
 * @internal shell-internal default render surface; games never import it.
 */
export interface DefaultSurfaceProps
  extends Omit<ThreeElements["meshStandardMaterial"], "args" | "normalMap" | "roughnessMap"> {
  color: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  detail?: boolean;
}

/**
 * The upgraded default material for un-modeled entities/objects: tuned PBR roughness/metalness plus
 * the shared procedural detail maps, so primitive fallbacks catch light and image-based reflections
 * instead of reading as flat plastic. Drop-in replacement for a bare `<meshStandardMaterial color>`.
 * @internal shell-internal default render surface; games never import it.
 */
export function DefaultSurface({
  color,
  roughness = 0.72,
  metalness = 0.04,
  detail = true,
  ...rest
}: DefaultSurfaceProps) {
  const maps = useMemo(() => (detail ? detailMaps() : null), [detail]);
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={metalness}
      envMapIntensity={0.6}
      normalMap={maps?.normal ?? null}
      normalScale={maps === null ? undefined : new THREE.Vector2(0.6, 0.6)}
      roughnessMap={maps?.roughness ?? null}
      {...rest}
    />
  );
}
