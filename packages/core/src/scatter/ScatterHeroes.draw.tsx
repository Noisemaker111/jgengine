/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { prepareGenerator, runGenerator, type GeneratorDefinition } from "@jgengine/core/generator/generator";
import { getGeneratorMesh, type GeneratorMeshSource } from "@jgengine/core/generator/generatorMesh.draw";
import { composeInstance } from "@jgengine/core/instancing/instanceUpload.draw";
import { staticDrawPoolFor, type PooledPlacement, type StaticDrawPool, type StaticDrawSlot } from "@jgengine/core/instancing/staticDrawPool.draw";
import { staticPoolCellAt } from "@jgengine/core/instancing/staticObjectBatches.draw";
import type { ScatterInstance } from "./scatterRegion";
import { createScatterHeroSet } from "./scatterHeroes";
import { scatterPlacementVariant, type ScatterGeneratorItem } from "./scatterGenerator";

/** Seconds between hero picks; the camera moving this far (m) picks again sooner. */
const PICK_INTERVAL_S = 0.25;
const PICK_MOVE_M = 2;
/** Hero meshes being grown at once; the rest wait their turn, nearest first. */
const GROWING_AT_ONCE = 4;
/** Seconds between hand-overs of the shown set to the stand-in field. */
const SHOW_INTERVAL_S = 0.5;
const SMALL_SHADOW_RADIUS = 0.6;

/** A hero's world placement in the shared batches. Heroes name no scene object, so picking reports none. */
interface HeroPlacement extends PooledPlacement {
  readonly matrix: THREE.Matrix4;
}

const NO_PLACEMENTS: readonly HeroPlacement[] = [];
const heroSlotOf = (): number => 0;
const heroMatrixOf = (placement: HeroPlacement, out: THREE.Matrix4): THREE.Matrix4 => out.copy(placement.matrix);

/**
 * One grown hero: the parts the shared static batches took, one instance each, and the parts they
 * could not (a see-through or custom-shader material) as meshes under `group`. Hidden until shown.
 * @internal
 */
export interface HeroMesh {
  readonly group: THREE.Group;
  readonly slots: readonly StaticDrawSlot[];
  readonly placement: HeroPlacement;
  readonly geometries: readonly THREE.BufferGeometry[];
}

/**
 * Hand a grown hero's parts to the shared static batches at its world `matrix`, so every hero of a
 * species shares one draw per material and area instead of a draw per part per hero (and per shadow
 * cascade). A part the batches cannot share becomes its own mesh under the returned group.
 * @internal
 */
export function placeHero(pool: StaticDrawPool, sources: readonly GeneratorMeshSource[], matrix: THREE.Matrix4): HeroMesh {
  const placement: HeroPlacement = { instanceId: "", matrix };
  const cell = staticPoolCellAt(matrix.elements[12] ?? 0, matrix.elements[14] ?? 0);
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.matrix.copy(matrix);
  group.visible = false;
  const slots: StaticDrawSlot[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  for (const source of sources) {
    if (source.geometry.boundingSphere === null) source.geometry.computeBoundingSphere();
    const castShadow = source.castShadow ?? (source.geometry.boundingSphere?.radius ?? 1) >= SMALL_SHADOW_RADIUS;
    const receiveShadow = source.receiveShadow ?? true;
    geometries.push(source.geometry);
    const slot = pool.acquire({ geometry: source.geometry, material: source.material, castShadow, receiveShadow }, cell, 1, "own");
    if (slot !== null) {
      slot.place([placement], heroSlotOf, heroMatrixOf);
      slots.push(slot);
      continue;
    }
    const mesh = new THREE.Mesh(source.geometry, source.material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
  }
  return { group, slots, placement, geometries };
}

/** Show or hide a placed hero in every draw it is part of. @internal */
export function showHero(hero: HeroMesh, shown: boolean): void {
  hero.group.visible = shown;
  for (const slot of hero.slots) slot.sync(shown ? [hero.placement] : NO_PLACEMENTS, heroSlotOf, heroMatrixOf);
}

/** Take a hero out of its batches and free the geometry it was grown with. @internal */
export function dropHero(hero: HeroMesh): void {
  for (const slot of hero.slots) slot.release();
  hero.group.removeFromParent();
  for (const geometry of hero.geometries) geometry.dispose();
}

/** Props for {@link ScatterHeroes}. */
export interface ScatterHeroesProps {
  item: string;
  definition: GeneratorDefinition;
  spec: ScatterGeneratorItem;
  /** Every placement of the species, shown or not. */
  instances: readonly ScatterInstance[];
  /** Called with the placements drawn as their own mesh, so the field hides their stand-ins. */
  onShown: (shown: ReadonlySet<string>) => void;
}

/**
 * Draw-side form of {@link ScatterHeroes}: the near placements of a unique scatter species, each
 * grown from its own seed into its own mesh drawn through the shared static batches
 * ({@link placeHero}), picked by {@link createScatterHeroSet} and shown only once grown, all driven
 * by the frame instead of React refs and state. @internal
 */
export function scatterHeroesDraw(
  getProps: () => ScatterHeroesProps,
): EngineDraw {
  const detail = () => getProps().spec.heroDetail ?? getProps().spec.detail ?? 1;
  let heroSet = createScatterHeroSet({ heroes: getProps().spec.heroes ?? 32, distance: getProps().spec.heroDistance ?? 40 });
  let heroSetKey = `${getProps().spec.heroes ?? 32}:${getProps().spec.heroDistance ?? 40}`;
  let byId = new Map<string, ScatterInstance>();
  let lastInstances: readonly ScatterInstance[] | null = null;
  const meshes = new Map<string, HeroMesh>();
  const growing = new Set<string>();
  let wanted: readonly string[] = [];
  let pending: readonly string[] = [];
  let lastShown = Number.NEGATIVE_INFINITY;
  let shownKey = "";
  const lastPick = { at: Number.NEGATIVE_INFINITY, x: Number.NaN, z: Number.NaN };
  const camera = new THREE.Vector3();
  let live = false;
  let scene: THREE.Scene | null = null;
  // Set when the picks change or a mesh finishes growing; the frame loop does work only then.
  let dirty = true;

  const drop = (id: string): void => {
    const hero = meshes.get(id);
    if (hero === undefined) return;
    dropHero(hero);
    meshes.delete(id);
  };

  const grow = (id: string): void => {
    const props = getProps();
    const placement = byId.get(id);
    const build = getGeneratorMesh(props.definition.output);
    if (placement === undefined || build === undefined) return;
    growing.add(id);
    const meta = scatterPlacementVariant(props.definition, props.item, props.spec, id).meta;
    const detailValue = detail();
    prepareGenerator(props.definition, meta, { detail: detailValue })
      .then(() => {
        if (!live) return;
        const sources = build(runGenerator(props.definition, meta, { detail: detailValue })) ?? [];
        const matrix = composeInstance(new THREE.Matrix4(), [placement.x, placement.y, placement.z], [0, placement.rotationY, 0], placement.scale);
        const target = scene;
        if (target === null) return;
        const hero = placeHero(staticDrawPoolFor(target), sources, matrix);
        meshes.set(id, hero);
        target.add(hero.group);
      })
      .catch((error: unknown) => console.error(`[jgengine] scatter ${props.item} failed to grow ${id}`, error))
      .finally(() => {
        growing.delete(id);
        dirty = true;
      });
  };

  const sync = () => {
    const props = getProps();
    const key = `${props.spec.heroes ?? 32}:${props.spec.heroDistance ?? 40}`;
    if (key !== heroSetKey) {
      heroSetKey = key;
      heroSet = createScatterHeroSet({ heroes: props.spec.heroes ?? 32, distance: props.spec.heroDistance ?? 40 });
      heroSet.setMembers(props.instances);
      dirty = true;
    }
    if (props.instances !== lastInstances) {
      lastInstances = props.instances;
      byId = new Map(props.instances.map((instance) => [instance.id, instance]));
      heroSet.setMembers(props.instances);
    }
  };

  return {
    priority: CAMERA_POST_FRAME_PRIORITY + 0.1,
    mount(state: EngineFrameState) {
      live = true;
      scene = state.scene;
      sync();
    },
    update() {
      sync();
    },
    frame(state: EngineFrameState) {
      sync();
      state.camera.getWorldPosition(camera);
      const now = state.clock.elapsedTime;
      const last = lastPick;
      const moved = Number.isNaN(last.x) || Math.hypot(camera.x - last.x, camera.z - last.z) > PICK_MOVE_M;
      if (moved || now - last.at > PICK_INTERVAL_S) {
        lastPick.at = now;
        lastPick.x = camera.x;
        lastPick.z = camera.z;
        const update = heroSet.update(camera.x, camera.z);
        for (const id of update.evicted) drop(id);
        if (update.changed || update.evicted.length > 0) {
          wanted = update.heroes;
          dirty = true;
        }
      }
      if (dirty) {
        dirty = false;
        const shown: string[] = [];
        for (const id of wanted) {
          if (meshes.has(id)) shown.push(id);
          else if (!growing.has(id) && growing.size < GROWING_AT_ONCE) grow(id);
        }
        pending = shown;
      }
      // Every change of the shown set rebuilds the stand-in field's instance lists, so changes are
      // gathered and handed over at most every SHOW_INTERVAL_S; a hero draws only once its stand-in hides.
      if (now - lastShown < SHOW_INTERVAL_S) return;
      const key = pending.join("|");
      if (key === shownKey) return;
      shownKey = key;
      lastShown = now;
      const shown = new Set(pending);
      for (const [id, hero] of meshes) showHero(hero, shown.has(id));
      getProps().onShown(shown);
    },
    dispose() {
      live = false;
      for (const id of [...meshes.keys()]) drop(id);
      scene = null;
    },
  };
}

/**
 * The near placements of a unique scatter species, each grown from its own seed into its own mesh,
 * drawn through the shared static batches ({@link placeHero}). Placements are picked by {@link createScatterHeroSet}, grown a few at a time (off the main
 * thread where the generator prepares there), and a stand-in is hidden only once its own mesh is
 * ready, so nothing pops out while a tree grows.
 * @internal
 */
export function ScatterHeroes(props: ScatterHeroesProps) {
  const latest = useRef(props);
  latest.current = props;
  return <EngineDrawMount create={() => scatterHeroesDraw(() => latest.current)} deps={[]} />;
}
