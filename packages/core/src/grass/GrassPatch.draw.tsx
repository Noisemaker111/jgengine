/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import { Euler, Group, Vector3 } from "three";
import type * as THREE from "three";

import type { GrassLook } from "@jgengine/core/grass/grassKind";

import { seedToUint32, type TerrainSeed } from "@jgengine/core/terrain/terrainSeed";
import { resolveTerrainSize, type TerrainArea, type TerrainHeightSampler } from "@jgengine/core/terrain/terrainMath.draw";
import { grassCoverDraw, type GrassCoverProps } from "./GrassCover.draw";
import { GRASS_COVER_MAX_SEGMENTS } from "./grassCoverGeometry.draw";
import { grassCushionShadeAt, grassStripeAt } from "./grassField";
import { grassFieldColors, resolveGrassBake, type GrassExclusion } from "./grassBake.draw";
import { createGrassMaterial, setGrassWindUniforms } from "./grassMaterial.draw";
import { grassWindAt, grassWindLook, type GrassWindSource } from "./grassWind";
import { GrassStream } from "./grassStream.draw";
import { GrassFrameShare } from "./grassFrameShare";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw, type DrawAttachProps } from "@jgengine/core/frame/useEngineDraw.draw";

/** Milliseconds of grass work one frame may spend, across every patch, once the view has filled. */
const BAKE_SLICE_MS = 3;
/**
 * Milliseconds per frame, across every patch, while a patch first fills the view, nearest leaves
 * first. Baking it all in one frame held the thread for over a second on a large field (each tuft
 * samples the ground), freezing the menu above the loading cover.
 */
const FILL_SLICE_MS = 8;
const frameShare = new GrassFrameShare();

/** The mat floats a little above the ground against z-fighting, but always under the blades, so a putting green's 1 cm blades stay visible. */
function grassCoverLift(look: GrassLook): number {
  // Cushion rims grow a fraction of the blade height, so a cushioned mat sits lower to keep them showing.
  return Math.min(0.035, Math.max(0.005, look.blade.bladeHeight * 0.25 * (1 - look.tuft.cushion * 0.6)));
}

/** Props for {@link GrassPatch}. */
export interface GrassPatchProps extends Pick<DrawAttachProps, "position" | "rotation" | "scale" | "visible"> {
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
  /** Revision of mutable ground heights; omit when the sampler is immutable. */
  heightRevision?: (() => number | undefined) | undefined;
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

function applyGroupProps(group: Group, props: GrassPatchProps): void {
  const position = props.position;
  if (position !== undefined) {
    if (Array.isArray(position)) group.position.set(position[0], position[1], position[2]);
    else if (position instanceof Vector3) group.position.copy(position);
  }
  const rotation = props.rotation;
  if (rotation !== undefined) {
    if (Array.isArray(rotation)) group.rotation.set(rotation[0], rotation[1], rotation[2]);
    else if (rotation instanceof Euler) group.rotation.copy(rotation);
  }
  const scale = props.scale;
  if (scale !== undefined) {
    if (Array.isArray(scale)) group.scale.set(scale[0], scale[1], scale[2]);
    else if (scale instanceof Vector3) group.scale.copy(scale);
  }
  if (props.visible !== undefined) group.visible = props.visible;
}

/**
 * The engine's one grass renderer: a camera-streamed blade field over a turf mat. Work follows the
 * camera — nodes near it bake every tuft, far ones a thinning share, and nothing past the distance
 * where a blade would be under a pixel — so a patch of any size costs what the view shows.
 */
export function grassPatchDraw(getProps: () => GrassPatchProps): EngineDraw {
  let group: Group | null = null;
  let stream: GrassStream | null = null;
  let handle: ReturnType<typeof createGrassMaterial> | null = null;
  let cover: EngineDraw | null = null;
  let coverState: EngineFrameState | null = null;
  let filling: (() => void) | undefined;
  const world = new Vector3();

  return {
    mount(state: EngineFrameState) {
      const props = getProps();
      const size = resolveTerrainSize(props.area);
      const bake = resolveGrassBake({
        look: props.look,
        area: props.area,
        ...(props.seed === undefined ? {} : { seed: props.seed }),
        ...(props.edgeFeather === undefined ? {} : { edgeFeather: props.edgeFeather }),
        ...(props.exclude === undefined ? {} : { exclude: props.exclude }),
        ...(props.heightAt === undefined ? {} : { heightAt: props.heightAt }),
        ...(props.coverageAt === undefined ? {} : { coverageAt: props.coverageAt }),
        ...(props.baseHeight === undefined ? {} : { baseHeight: props.baseHeight }),
      });
      // Under a shared wind the sway can reach a full bend, so bounds are sized for it.
      const windy = props.wind !== undefined;
      handle = createGrassMaterial(
        windy ? { ...props.look, wind: { ...props.look.wind, windStrength: Math.max(1, props.look.wind.windStrength) } } : props.look,
        props.groundColor,
      );
      group = new Group();
      applyGroupProps(group, props);
      state.scene.add(group);
      stream = new GrassStream(bake, handle, {
        castShadow: props.castShadow ?? false,
        receiveShadow: props.receiveShadow ?? true,
        frustumCulled: props.frustumCulled ?? true,
        ...(props.heightRevision === undefined ? {} : { heightRevision: props.heightRevision }),
      });
      group.add(stream.group);
      if (props.look.growth.groundCover > 0) {
        const colors = grassFieldColors(props.look);
        const coverArea: [number, number] = [size.width, size.depth];
        const coverSeed = seedToUint32(bake.seed) % 100000;
        const striped = props.look.mowing.stripeWidth > 0 && props.look.mowing.stripeContrast > 0;
        const cushioned = props.look.tuft.cushion > 0;
        const shadeAt = !striped && !cushioned ? undefined : (() => {
          const halfW = bake.width / 2;
          const halfD = bake.depth / 2;
          return (x: number, z: number) =>
            (striped ? grassStripeAt(props.look, x, z) * props.look.mowing.stripeContrast : 0)
            + (cushioned ? grassCushionShadeAt(props.look, bake.clumpSeed, halfW, halfD, x, z) : 0);
        })();
        // A striped or cushioned mat needs a few cells per stripe or mound, or the shading aliases into blotches.
        const feature = Math.min(striped ? props.look.mowing.stripeWidth : Infinity, cushioned ? props.look.tuft.clumpSize * 2 : Infinity);
        const coverSegments = Number.isFinite(feature)
          ? Math.min(GRASS_COVER_MAX_SEGMENTS, Math.max(Math.round(Math.max(size.width, size.depth) / 2), Math.ceil((Math.max(size.width, size.depth) * 8) / feature)))
          : undefined;
        const coverProps: GrassCoverProps = {
          area: coverArea,
          seed: coverSeed,
          colorBase: colors.base,
          colorTip: colors.tip,
          strength: props.look.growth.groundCover,
          edgeFeather: bake.edgeFeather,
          heightAt: bake.heightAt,
          coverageAt: bake.turfAt,
          detail: props.look.style.detail,
          lift: grassCoverLift(props.look),
          ...(shadeAt === undefined ? {} : { shadeAt }),
          ...(coverSegments === undefined ? {} : { segments: coverSegments }),
        };
        cover = grassCoverDraw(() => coverProps);
        coverState = childFrameState(state, group);
        cover.mount?.(coverState);
      }
      // The first view counts as loading, so play and captures never start on a half-grown field.
      filling = trackSceneWork("grass-fill");
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      if (group !== null) applyGroupProps(group, props);
      if (handle === null || stream === null || group === null) return;
      handle.uniforms.uTime.value = state.clock.elapsedTime;
      if (props.wind !== undefined) {
        group.getWorldPosition(world);
        setGrassWindUniforms(handle.uniforms, { ...grassWindLook(props.look.wind, grassWindAt(props.wind, world.x, world.z, state.clock.elapsedTime), props.wind.response ?? 1), stiffness: props.look.blade.stiffness });
      }
      stream.update(state.camera, state.size.height, frameShare.slice(state.gl, state.clock.elapsedTime, stream.filled ? BAKE_SLICE_MS : FILL_SLICE_MS));
      if (stream.busy) frameShare.stillBusy(state.gl);
      if (stream.filled && filling !== undefined) {
        filling();
        filling = undefined;
      }
      cover?.frame?.(coverState ?? state, (coverState ?? state).delta);
    },
    dispose(state: EngineFrameState) {
      filling?.();
      filling = undefined;
      cover?.dispose?.(coverState ?? state);
      cover = null;
      coverState = null;
      stream?.dispose();
      stream = null;
      handle?.material.dispose();
      handle = null;
      if (group !== null) state.scene.remove(group);
      group = null;
    },
  };
}

/**
 * The engine's one grass renderer: a camera-streamed blade field over a turf mat. Work follows the
 * camera — nodes near it bake every tuft, far ones a thinning share, and nothing past the distance
 * where a blade would be under a pixel — so a patch of any size costs what the view shows.
 */
export function GrassPatch(props: GrassPatchProps) {
  const latest = useRef<GrassPatchProps>(props);
  latest.current = props;
  const windy = props.wind !== undefined;
  useEngineDraw(() => grassPatchDraw(() => latest.current), [
    props.look,
    props.area,
    props.seed,
    props.edgeFeather,
    props.exclude,
    props.heightAt,
    props.heightRevision,
    props.coverageAt,
    props.baseHeight,
    props.groundColor,
    props.castShadow,
    props.receiveShadow,
    props.frustumCulled,
    windy,
  ]);
  return null;
}
