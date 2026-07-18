import { useCallback, useMemo } from "react";

import { resolveGrassObject } from "@jgengine/core/world/grassKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import type { TerrainField } from "@jgengine/core/world/terrain";

import { GrassField } from "../terrain/GrassField";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

function sampleHeight(field: TerrainField, x: number, z: number): number {
  return field.sampleHeight(x, z);
}

/**
 * One authored grass volume → an instanced vertex-wind `GrassField` over its footprint.
 * `area`/`bladeHeight`/`wind`/`heightAt` are memoized so `GrassField`'s internal geometry and
 * material `useMemo`s see stable references across re-renders — otherwise every re-render (the
 * live-sync document context object is recreated per render) rebuilds the blade geometry and
 * shader material from scratch, which shows up as recurring render hitches.
 */
function OneGrass({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const resolved = useMemo(() => resolveGrassObject(object), [object]);
  const heightAt = useCallback((x: number, z: number) => sampleHeight(context.field, x, z), [context.field]);
  const area = useMemo<[number, number] | null>(
    () => (resolved === null ? null : [resolved.size[0], resolved.size[1]]),
    [resolved],
  );
  const bladeHeight = useMemo<[number, number] | null>(
    () => (resolved === null ? null : [resolved.rules.bladeHeight * 0.7, resolved.rules.bladeHeight]),
    [resolved],
  );
  const wind = useMemo(
    () =>
      resolved === null
        ? null
        : { strength: resolved.rules.windStrength, speed: resolved.rules.windSpeed, gustScale: resolved.rules.windGust },
    [resolved],
  );
  if (resolved === null || area === null || bladeHeight === null || wind === null) return null;
  const { rules, center } = resolved;
  // Size the instance buffer to the authored patch (bounded): the default 1500-blade buffer reads
  // as stubble on anything bigger than a lawn, silently ignoring the authored density.
  const instanceCount = Math.max(1500, Math.min(60000, Math.ceil(rules.density * area[0] * area[1])));
  return (
    <GrassField
      position={[center[0], center[1], center[2]]}
      area={area}
      count={instanceCount}
      density={rules.density}
      bladeHeight={bladeHeight}
      colorBase={rules.colorBase}
      colorTip={rules.colorTip}
      colorVariation={rules.colorVariation}
      roughness={rules.roughness}
      seed={hashSeed(rules.seed.length > 0 ? rules.seed : object.id)}
      heightAt={heightAt}
      wind={wind}
    />
  );
}

/** Registers the `grass_field` volume renderer. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerGrassFieldRenderer(): void {
  registerSceneKindRenderer("grass_field", ({ objects, context }) => (
    <>
      {objects.map((object) => (
        <OneGrass key={object.id} object={object} context={context} />
      ))}
    </>
  ));
}
