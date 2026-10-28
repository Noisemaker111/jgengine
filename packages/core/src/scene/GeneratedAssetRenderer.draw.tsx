import { useMemo } from "react";

import { runGenerator } from "@jgengine/core/generator/generator";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { PARTS_OUTPUT, isGeneratedAsset, resolveGeneratorAsset, type GeneratedAsset } from "@jgengine/core/scene/assetGenerator";
import { StaticShapeInstances, type StaticShapeInstance } from "@jgengine/core/instancing/staticShapeInstances.draw";

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

function variantAsset({ definition, variant }: GeneratorPreviewProps): GeneratedAsset | null {
  const output = runGenerator(definition, variant.meta);
  return isGeneratedAsset(output) ? output : null;
}

function PartsPreview(props: GeneratorPreviewProps) {
  const { definition, variant } = props;
  const asset = useMemo(() => variantAsset({ definition, variant }), [definition, variant]);
  return asset === null ? null : <GeneratedParts asset={asset} />;
}

/** Registers the variant-tile preview for parts generators. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerPartsPreview(): void {
  registerGeneratorPreview(PARTS_OUTPUT, {
    Component: PartsPreview,
    frame: (props) => {
      const asset = variantAsset(props);
      if (asset === null) return { target: [0, 0.5, 0], distance: 3 };
      const { min, max } = asset.bounds;
      const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.1);
      return { target: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], distance: extent * 1.9 };
    },
  });
}
