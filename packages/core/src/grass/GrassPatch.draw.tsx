import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3, type Group } from "three";
import type * as THREE from "three";

import type { GrassLook } from "@jgengine/core/grass/grassKind";

import { seedToUint32, type TerrainSeed } from "@jgengine/core/terrain/terrainSeed";
import { resolveTerrainSize, type TerrainArea, type TerrainHeightSampler } from "@jgengine/core/terrain/terrainMath.draw";
import { GrassCover } from "./GrassCover.draw";
import { GRASS_COVER_MAX_SEGMENTS } from "./grassCoverGeometry.draw";
import { grassStripeAt } from "./grassField";
import { grassFieldColors, resolveGrassBake, type GrassExclusion } from "./grassBake.draw";
import { createGrassMaterial, setGrassWindUniforms } from "./grassMaterial.draw";
import { grassWindAt, grassWindLook, type GrassWindSource } from "./grassWind";
import { GrassStream } from "./grassStream.draw";

/** Milliseconds of tuft baking one frame may spend once the patch has filled the view. */
const BAKE_SLICE_MS = 3;
/**
 * Milliseconds per frame while the patch first fills the view, nearest leaves first. Baking it all
 * in one frame held the thread for over a second on a large field (each tuft samples the ground),
 * freezing the menu above the loading cover.
 */
const FILL_SLICE_MS = 8;

/** The mat floats a little above the ground against z-fighting, but always under the blades, so a putting green's 1 cm blades stay visible. */
function grassCoverLift(look: GrassLook): number {
  return Math.min(0.035, Math.max(0.008, look.blade.bladeHeight * 0.25));
}

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
  /** World height of the patch origin, for `look.growAbove`. Default 0. */
  baseHeight?: number;
  /** Terrain colour the blade roots and far field blend into. */
  groundColor?: THREE.ColorRepresentation | undefined;
  castShadow?: boolean;
  receiveShadow?: boolean;
  frustumCulled?: boolean;
  /** A shared wind the blades read each frame; omit to sway with the look's own wind numbers. */
  wind?: GrassWindSource | undefined;
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
  baseHeight,
  groundColor,
  castShadow = false,
  receiveShadow = true,
  frustumCulled = true,
  wind,
  ...groupProps
}: GrassPatchProps) {
  const size = resolveTerrainSize(area);
  const bake = useMemo(
    () => resolveGrassBake({ look, area, ...(seed === undefined ? {} : { seed }), ...(edgeFeather === undefined ? {} : { edgeFeather }),
      ...(exclude === undefined ? {} : { exclude }), ...(heightAt === undefined ? {} : { heightAt }), ...(coverageAt === undefined ? {} : { coverageAt }),
      ...(baseHeight === undefined ? {} : { baseHeight }) }),
    [look, area, seed, edgeFeather, exclude, heightAt, coverageAt, baseHeight],
  );
  // Under a shared wind the sway can reach a full bend, so bounds are sized for it.
  const windy = wind !== undefined;
  const handle = useMemo(() => createGrassMaterial(windy ? { ...look, wind: { ...look.wind, windStrength: Math.max(1, look.wind.windStrength) } } : look, groundColor), [look, groundColor, windy]);
  const origin = useRef<Group>(null);
  const world = useMemo(() => new Vector3(), []);
  const stream = useMemo(() => new GrassStream(bake, handle, { castShadow, receiveShadow, frustumCulled }), [bake, handle, castShadow, receiveShadow, frustumCulled]);
  const filling = useRef(true);
  useEffect(() => {
    filling.current = true;
    return () => stream.dispose();
  }, [stream]);
  useEffect(() => () => handle.material.dispose(), [handle]);
  useFrame((state) => {
    handle.uniforms.uTime.value = state.clock.elapsedTime;
    if (wind !== undefined) {
      origin.current?.getWorldPosition(world);
      setGrassWindUniforms(handle.uniforms, { ...grassWindLook(look.wind, grassWindAt(wind, world.x, world.z, state.clock.elapsedTime), wind.response ?? 1), stiffness: look.blade.stiffness });
    }
    stream.update(state.camera, state.size.height, filling.current ? FILL_SLICE_MS : BAKE_SLICE_MS);
    if (filling.current && stream.stats().pending === 0) filling.current = false;
  });

  const colors = useMemo(() => grassFieldColors(look), [look]);
  const coverArea = useMemo(() => [size.width, size.depth] as const, [size.width, size.depth]);
  const coverSeed = seedToUint32(bake.seed) % 100000;
  const striped = look.mowing.stripeWidth > 0 && look.mowing.stripeContrast > 0;
  const stripeAt = useMemo(
    () => (striped ? (x: number, z: number) => grassStripeAt(look, x, z) * look.mowing.stripeContrast : undefined),
    [striped, look],
  );
  // A striped mat needs a few cells per stripe, or the bands alias into blotches.
  const coverSegments = striped
    ? Math.min(GRASS_COVER_MAX_SEGMENTS, Math.max(Math.round(Math.max(size.width, size.depth) / 2), Math.ceil((Math.max(size.width, size.depth) * 8) / look.mowing.stripeWidth)))
    : undefined;
  return (
    <group ref={origin} {...groupProps}>
      {look.growth.groundCover > 0 ? (
        <GrassCover
          area={coverArea}
          seed={coverSeed}
          colorBase={colors.base}
          colorTip={colors.tip}
          strength={look.growth.groundCover}
          edgeFeather={bake.edgeFeather}
          heightAt={bake.heightAt}
          coverageAt={bake.turfAt}
          stripeAt={stripeAt}
          lift={grassCoverLift(look)}
          {...(coverSegments === undefined ? {} : { segments: coverSegments })}
        />
      ) : null}
      <primitive object={stream.group} />
    </group>
  );
}
