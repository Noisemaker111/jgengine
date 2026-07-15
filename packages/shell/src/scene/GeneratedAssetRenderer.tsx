import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { resolveGeneratorAsset, type GeneratedAsset, type GeneratedPart } from "@jgengine/core/scene/assetGenerator";

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const NEUTRAL = "#b8b0a4";

/** All parts of one generated asset, batched into one instanced box draw per color. */
function GeneratedParts({ asset }: { asset: GeneratedAsset }) {
  const byColor = useMemo(() => {
    const groups = new Map<string, GeneratedPart[]>();
    for (const part of asset.parts) {
      const color = part.color ?? NEUTRAL;
      const bucket = groups.get(color);
      if (bucket === undefined) groups.set(color, [part]);
      else bucket.push(part);
    }
    return [...groups.entries()];
  }, [asset]);
  return (
    <>
      {byColor.map(([color, parts]) => (
        <ColorBatch key={color} color={color} parts={parts} />
      ))}
    </>
  );
}

function ColorBatch({ color, parts }: { color: string; parts: readonly GeneratedPart[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    parts.forEach((part, index) => {
      position.set(part.position[0], part.position[1], part.position[2]);
      euler.set(0, part.rotationY ?? 0, 0);
      quaternion.setFromEuler(euler);
      scale.set(Math.max(1e-3, part.size[0]), Math.max(1e-3, part.size[1]), Math.max(1e-3, part.size[2]));
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.count = parts.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);
  return (
    <instancedMesh ref={meshRef} args={[UNIT_BOX, undefined, Math.max(1, parts.length)]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.62} metalness={0.04} />
    </instancedMesh>
  );
}

/** Props for {@link GeneratedAsset}: the placed instance's `meta` (assetId + params + seed) and transform. */
export interface GeneratedAssetProps {
  /** The placed instance meta — `{ assetId, seed, ...params }`. Re-resolved every render, never baked. */
  meta: Record<string, unknown> | undefined;
  position?: readonly [number, number, number];
  rotationY?: number;
}

/**
 * Renders one placed generator-asset instance by re-resolving its `meta` through the registered
 * generator and instancing the parts. Returns null when the meta names no generator. The runtime
 * counterpart to placing a parametric asset — the geometry is data, recomputed from params + seed.
 * @internal — `AuthoredScene` mounts this for generator markers automatically.
 */
export function GeneratedAssetInstance({ meta, position = [0, 0, 0], rotationY = 0 }: GeneratedAssetProps) {
  const asset = useMemo(() => resolveGeneratorAsset(meta), [meta]);
  if (asset === null) return null;
  return (
    <group position={[position[0], position[1], position[2]]} rotation={[0, rotationY, 0]}>
      <GeneratedParts asset={asset} />
    </group>
  );
}
