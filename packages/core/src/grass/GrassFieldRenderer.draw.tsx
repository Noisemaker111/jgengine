import { useCallback, useMemo } from "react";

import { resolveGrassObject } from "@jgengine/core/grass/grassKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import type { TerrainField } from "@jgengine/core/terrain/terrain";
import { clearanceMasksFrom, DEFAULT_CLEARANCE_KINDS } from "@jgengine/core/scatter/scatterRegion";
import { masksInfluence, masksWithin } from "@jgengine/core/world/geometry";
import { windField } from "@jgengine/core/world/wind";

import { GrassPatch } from "@jgengine/core/grass/GrassPatch.draw";
import type { GrassExclusion } from "@jgengine/core/grass/grassBake.draw";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "@jgengine/core/scene/sceneKindRenderers.draw";

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

function sampleHeight(field: TerrainField, x: number, z: number): number {
  return field.sampleHeight(x, z);
}

/**
 * One authored grass volume → the shared `GrassPatch` over its footprint.
 * `area`/`heightAt`/`coverageAt` are memoized so `GrassPatch`'s stream and
 * material `useMemo`s see stable references across re-renders — otherwise every re-render (the
 * live-sync document context object is recreated per render) rebuilds the blade stream and
 * shader material from scratch, which shows up as recurring render hitches.
 */
function OneGrass({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const resolved = useMemo(() => resolveGrassObject(object), [object]);
  const heightAt = useCallback((x: number, z: number) => resolved === null ? 0 :
    sampleHeight(context.field, x + resolved.center[0], z + resolved.center[2]) - resolved.center[1], [context.field, resolved]);
  const area = useMemo<[number, number] | null>(
    () => (resolved === null ? null : [resolved.size[0], resolved.size[1]]),
    [resolved],
  );
  const { markers, paths } = context.document;
  const masks = useMemo(() => {
    const authored = clearanceMasksFrom(context.document, {
      kinds: [...DEFAULT_CLEARANCE_KINDS, "road", "walkway", "route", "path"],
    });
    // Keep the entire authored footing clear; feather regrowth outside its edge.
    const grown = {
      discs: authored.discs.map(zone => ({ ...zone, radius: zone.radius + (zone.feather ?? 0) })),
      corridors: authored.corridors.map(zone => ({ ...zone, halfWidth: zone.halfWidth + (zone.feather ?? 0) })),
    };
    if (resolved === null) return grown;
    // Every tuft and mat vertex tests these, so keep only the ones that reach this patch.
    const [cx, , cz] = resolved.center;
    const [w, d] = resolved.size;
    return masksWithin(grown, { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  }, [markers, paths, context.document.volumes, resolved]);
  const coverageAt = useCallback((x: number, z: number) => resolved === null ? 0 :
    1 - masksInfluence(x + resolved.center[0], z + resolved.center[2], masks), [resolved, masks]);
  // Depends on the volumes slice, not the context object — the live-sync context is recreated
  // per render and would otherwise rebuild the grass stream every frame.
  const volumes = context.document.volumes;
  const exclude = useMemo(
    () => (resolved === null ? null : grassExclusionsFrom(context, resolved.center)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volumes, resolved],
  );
  // The document's authored ambient wind is the one wind its grass, weather and boats read.
  const windConfig = context.document.simulation?.weather?.wind;
  const wind = useMemo(() => (windConfig === undefined ? undefined : { field: windField(windConfig) }), [windConfig]);
  if (resolved === null || area === null || exclude === null) return null;
  const { look, center } = resolved;
  return (
    <GrassPatch
      position={[center[0], center[1], center[2]]}
      look={look}
      area={area}
      seed={object.id}
      groundColor={context.groundColorAt?.(center[0], center[2])}
      heightAt={heightAt}
      coverageAt={coverageAt}
      baseHeight={center[1]}
      edgeFeather={2.2}
      exclude={exclude}
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
