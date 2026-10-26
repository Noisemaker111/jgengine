import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";

import type { GrassLook } from "@jgengine/core/world/grassKind";

import { seedToUint32, type TerrainSeed } from "../terrain/random";
import { resolveTerrainSize, type TerrainArea, type TerrainHeightSampler } from "../terrain/terrainMath";
import { GrassCover } from "./GrassCover";
import { grassFieldColors, resolveGrassBake, type GrassExclusion } from "./grassBake";
import { createGrassMaterial } from "./grassMaterial";
import { GrassStream } from "./grassStream";

/** Milliseconds of tuft baking one frame may spend after the first; the first frame bakes all it sees. */
const BAKE_SLICE_MS = 3;

/** Props for {@link GrassPatch}. */
export interface GrassPatchProps extends Omit<ThreeElements["group"], "children"> {
  /** The patch's look (`readGrassLook` from a `grass_field` volume, or a `grass()` descriptor's `look`). */
  look: GrassLook;
  /** Footprint size in metres, centred on the group origin. */
  area: TerrainArea;
  /** Seed used when `look.seed` is empty (an editor volume passes its id). */
  seed?: TerrainSeed;
  /** Metres of soft fringe at the patch border. Default scales with the patch, 1.5–4 m. */
  edgeFeather?: number;
  exclude?: readonly GrassExclusion[];
  /** Patch-local ground height. */
  heightAt?: TerrainHeightSampler;
  /** Patch-local 0..1 coverage (roads, footings); 0 grows nothing. */
  coverageAt?: TerrainHeightSampler;
  /** Terrain colour the blade roots and far field blend into. */
  groundColor?: THREE.ColorRepresentation;
  castShadow?: boolean;
  receiveShadow?: boolean;
  frustumCulled?: boolean;
}

/**
 * The engine's one grass renderer: a camera-streamed blade field over a turf mat. Work follows the
 * camera — nodes near it bake every tuft, far ones a thinning share, and nothing past the distance
 * where a blade would be under a pixel — so a patch of any size costs what the view shows.
 */
export function GrassPatch({
  look,
  area,
  seed,
  edgeFeather,
  exclude,
  heightAt,
  coverageAt,
  groundColor,
  castShadow = false,
  receiveShadow = true,
  frustumCulled = true,
  ...groupProps
}: GrassPatchProps) {
  const size = resolveTerrainSize(area);
  const bake = useMemo(
    () => resolveGrassBake({ look, area, ...(seed === undefined ? {} : { seed }), ...(edgeFeather === undefined ? {} : { edgeFeather }),
      ...(exclude === undefined ? {} : { exclude }), ...(heightAt === undefined ? {} : { heightAt }), ...(coverageAt === undefined ? {} : { coverageAt }) }),
    [look, area, seed, edgeFeather, exclude, heightAt, coverageAt],
  );
  const handle = useMemo(() => createGrassMaterial(look, groundColor), [look, groundColor]);
  const stream = useMemo(() => new GrassStream(bake, handle, { castShadow, receiveShadow, frustumCulled }), [bake, handle, castShadow, receiveShadow, frustumCulled]);
  const first = useRef(true);
  useEffect(() => {
    first.current = true;
    return () => stream.dispose();
  }, [stream]);
  useEffect(() => () => handle.material.dispose(), [handle]);
  useFrame((state) => {
    handle.uniforms.uTime.value = state.clock.elapsedTime;
    stream.update(state.camera, state.size.height, first.current ? Infinity : BAKE_SLICE_MS);
    first.current = false;
  });

  const colors = useMemo(() => grassFieldColors(look), [look]);
  const coverArea = useMemo(() => [size.width, size.depth] as const, [size.width, size.depth]);
  const coverSeed = seedToUint32(bake.seed) % 100000;
  return (
    <group {...groupProps}>
      {look.groundCover > 0 ? (
        <GrassCover
          area={coverArea}
          seed={coverSeed}
          colorBase={colors.base}
          colorTip={colors.tip}
          strength={look.groundCover}
          edgeFeather={bake.edgeFeather}
          heightAt={bake.heightAt}
          coverageAt={bake.coverageAt}
        />
      ) : null}
      <primitive object={stream.group} />
    </group>
  );
}
