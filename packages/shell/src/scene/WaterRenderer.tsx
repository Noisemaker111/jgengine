import { useCallback, useMemo } from "react";

import { resolveWaterObject, type WaterRules } from "@jgengine/core/world/waterKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import { Ocean } from "../water/Ocean";
import type { OceanConfig } from "../water/OceanConfig";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

/** Map the editor-authored water params onto the shell Ocean shader config. */
function toOceanConfig(rules: WaterRules, size: readonly [number, number], depthRange: number): OceanConfig {
  const maxSpan = Math.max(size[0], size[1]);
  return {
    size: size[0],
    depth: size[1],
    // ~2 vertices per meter (bounded): the old span/2 gave a 30 m lake a 15×15 grid, which waved
    // like a blanket instead of water.
    resolution: Math.min(220, Math.max(48, Math.round(maxSpan * 2))),
    amplitude: rules.waveHeight,
    speed: rules.waveSpeed,
    timeScale: rules.waveSpeed,
    waveScale: Math.min(300, Math.max(2, 6 / rules.waveScale)),
    color: {
      deep: rules.color,
      shallow: rules.shallowColor,
      opacity: rules.opacity,
      // The editor's reflectivity slider stays restrained: full slider ≈ a soft sky sheen at
      // grazing angles, never the white-out the old fresnel washed the whole sheet with.
      fresnelStrength: rules.reflectivity * 0.9,
      depthRange,
      sparkle: 0.25 + rules.reflectivity * 0.3,
    },
    foam: {
      coverage: Math.min(1, rules.foam / 4),
      intensity: Math.min(1.2, rules.foam / 3),
      shoreWidth: Math.min(1.5, rules.foam * 0.35),
    },
  };
}

/**
 * One authored water volume → a bounded, animated Ocean sheet at the box top, draped over the live
 * terrain's depth: the carved lake bed (see `lakebedFromWaterVolumes`) gives every vertex a real
 * water-column depth, which drives shallow→deep color, shore transparency/foam, and wave damping.
 */
function OneWater({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const resolved = useMemo(() => resolveWaterObject(object), [object]);
  const surfaceY = resolved === null ? 0 : resolved.center[1];
  const centerX = resolved === null ? 0 : resolved.center[0];
  const centerZ = resolved === null ? 0 : resolved.center[2];
  const depthAt = useCallback(
    (x: number, z: number) => surfaceY - context.field.sampleHeight(centerX + x, centerZ + z),
    [context.field, surfaceY, centerX, centerZ],
  );
  const config = useMemo(() => {
    if (resolved === null) return null;
    // Full deep color roughly where the carved bed bottoms out (box depth + undercut headroom).
    const boxDepth = Math.max(0.4, resolved.center[1] - (object.center?.y ?? resolved.center[1]) + 0.001) * 2;
    return toOceanConfig(resolved.rules, resolved.size, Math.max(0.8, boxDepth * 0.9));
  }, [resolved, object]);
  if (resolved === null || config === null) return null;
  return <Ocean config={config} position={[centerX, surfaceY, centerZ]} depthAt={depthAt} />;
}

/** Registers the `water` volume runtime renderer. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerWaterRenderer(): void {
  registerSceneKindRenderer("water", ({ objects, context }) => (
    <>
      {objects.map((object) => (
        <OneWater key={object.id} object={object} context={context} />
      ))}
    </>
  ));
}
