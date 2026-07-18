import { useMemo } from "react";

import { resolveWaterObject, type WaterRules } from "@jgengine/core/world/waterKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import { Ocean } from "../water/Ocean";
import type { OceanConfig } from "../water/OceanConfig";
import { registerSceneKindRenderer } from "./sceneKindRenderers";

/** Map the editor-authored water params onto the shell Ocean shader config. */
function toOceanConfig(rules: WaterRules, size: readonly [number, number]): OceanConfig {
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
      fresnelStrength: rules.reflectivity,
    },
    foam: { coverage: Math.min(1, rules.foam / 4), intensity: Math.min(1.5, rules.foam / 3) },
  };
}

/** One authored water volume → a bounded, animated Ocean plane at the box top. */
function OneWater({ object }: { object: SceneKindObject }) {
  const resolved = useMemo(() => resolveWaterObject(object), [object]);
  const config = useMemo(() => (resolved === null ? null : toOceanConfig(resolved.rules, resolved.size)), [resolved]);
  if (resolved === null || config === null) return null;
  return <Ocean config={config} position={[resolved.center[0], resolved.center[1], resolved.center[2]]} />;
}

/** Registers the `water` volume runtime renderer. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerWaterRenderer(): void {
  registerSceneKindRenderer("water", ({ objects }) => (
    <>
      {objects.map((object) => (
        <OneWater key={object.id} object={object} />
      ))}
    </>
  ));
}
