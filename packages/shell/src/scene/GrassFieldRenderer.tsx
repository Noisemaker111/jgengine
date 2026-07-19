import { useCallback, useMemo } from "react";

import { resolveGrassObject } from "@jgengine/core/world/grassKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import type { TerrainField } from "@jgengine/core/world/terrain";

import { GrassField } from "../terrain/GrassField";
import type { GrassExclusion } from "../terrain/grassGeometry";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers";

/** Volume kinds turf yields to — blades never grow through cracked soil or out of open water. */
const GRASS_YIELDS_TO = new Set(["soil", "water"]);

/**
 * Patch-local no-grow rects from the document's soil/water volumes. Water rects shrink by the
 * shore margin so a fringe of blades still wades into the shallows like a real pond edge.
 */
function grassExclusionsFrom(
  context: SceneKindRenderContext,
  center: readonly [number, number, number],
): GrassExclusion[] {
  const zones: GrassExclusion[] = [];
  for (const volume of context.document.volumes) {
    if (!GRASS_YIELDS_TO.has(volume.kind) || volume.halfExtents === undefined) continue;
    const shoreMargin = volume.kind === "water" ? 1.6 : 0;
    const halfX = Math.max(0, volume.halfExtents.x - shoreMargin);
    const halfZ = Math.max(0, volume.halfExtents.z - shoreMargin);
    if (halfX <= 0 || halfZ <= 0) continue;
    zones.push({
      center: [volume.center.x - center[0], volume.center.z - center[2]],
      half: [halfX, halfZ],
      feather: volume.kind === "water" ? 2.4 : 1.2,
    });
  }
  return zones;
}

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
  // Depends on the volumes slice, not the context object — the live-sync context is recreated
  // per render and would otherwise rebuild the tuft geometry every frame.
  const volumes = context.document.volumes;
  const exclude = useMemo(
    () => (resolved === null ? null : grassExclusionsFrom(context, resolved.center)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volumes, resolved],
  );
  if (resolved === null || area === null || bladeHeight === null || wind === null || exclude === null) return null;
  const { rules, center } = resolved;
  // Size the instance buffer to the authored patch (bounded): the default 1500-blade buffer reads
  // as stubble on anything bigger than a lawn, silently ignoring the authored density. The 250k cap
  // is independent of the (now wider) camera distance fade — instances are placed across the patch
  // footprint, and the fade only thins how many *draw* at range in the vertex shader — so a deeper
  // meadow reads expansive without raising the instance ceiling.
  const instanceCount = Math.max(1500, Math.min(250000, Math.ceil(rules.density * area[0] * area[1])));
  return (
    <GrassField
      position={[center[0], center[1], center[2]]}
      area={area}
      count={instanceCount}
      density={rules.density}
      bladeHeight={bladeHeight}
      colorBase={rules.colorBase}
      colorTip={rules.colorTip}
      colorGround={context.groundColorAt?.(center[0], center[2])}
      colorVariation={rules.colorVariation}
      roughness={rules.roughness}
      seed={hashSeed(rules.seed.length > 0 ? rules.seed : object.id)}
      heightAt={heightAt}
      wind={wind}
      edgeFeather={2.2}
      exclude={exclude}
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
