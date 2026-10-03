import { useMemo } from "react";

import { resolveGeneratorAsset, type GeneratedAsset } from "@jgengine/core/scene/assetGenerator";
import { StaticShapeInstances, type StaticShapeInstance } from "../render/staticShapeInstances";

const NEUTRAL = "#b8b0a4";

/** All parts of one generated asset, batched into one instanced box draw per color. */
function GeneratedParts({ asset }: { asset: GeneratedAsset }) {
  const instances = useMemo<StaticShapeInstance[]>(() => asset.parts.map(part => ({
    shape: "box",
    position: part.position,
    rotation: [0, part.rotationY ?? 0, 0],
    scale: [Math.max(1e-3, part.size[0]), Math.max(1e-3, part.size[1]), Math.max(1e-3, part.size[2])],
    surface: { color: part.color ?? NEUTRAL, roughness: 0.62, metalness: 0.04 },
  })), [asset]);
  return <StaticShapeInstances instances={instances} />;
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
