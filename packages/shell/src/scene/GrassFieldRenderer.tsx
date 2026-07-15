import { useMemo } from "react";

import { resolveGrassObject } from "@jgengine/core/world/grassKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

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

/** One authored grass volume → an instanced vertex-wind `GrassField` over its footprint. */
function OneGrass({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const resolved = useMemo(() => resolveGrassObject(object), [object]);
  if (resolved === null) return null;
  const { rules, size, center } = resolved;
  return (
    <GrassField
      position={[center[0], center[1], center[2]]}
      area={[size[0], size[1]]}
      density={rules.density}
      bladeHeight={[rules.bladeHeight * 0.7, rules.bladeHeight]}
      colorBase={rules.colorBase}
      colorTip={rules.colorTip}
      colorVariation={rules.colorVariation}
      roughness={rules.roughness}
      seed={hashSeed(rules.seed.length > 0 ? rules.seed : object.id)}
      heightAt={(x, z) => context.field.sampleHeight(x, z)}
      wind={{ strength: rules.windStrength, speed: rules.windSpeed, gustScale: rules.windGust }}
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
