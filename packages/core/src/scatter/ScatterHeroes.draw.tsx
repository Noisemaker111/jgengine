import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
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
 * The near placements of a unique scatter species, each grown from its own seed into its own mesh,
 * drawn through the shared static batches ({@link placeHero}). Placements are picked by {@link createScatterHeroSet}, grown a few at a time (off the main
 * thread where the generator prepares there), and a stand-in is hidden only once its own mesh is
 * ready, so nothing pops out while a tree grows.
 * @internal
 */
export function ScatterHeroes({ item, definition, spec, instances, onShown }: ScatterHeroesProps) {
  const scene = useThree((state) => state.scene);
  const detail = spec.heroDetail ?? spec.detail ?? 1;
  const heroSet = useMemo(
    () => createScatterHeroSet({ heroes: spec.heroes ?? 32, distance: spec.heroDistance ?? 40 }),
    [spec.heroes, spec.heroDistance],
  );
  const byId = useMemo(() => new Map(instances.map((instance) => [instance.id, instance])), [instances]);
  useEffect(() => heroSet.setMembers(instances), [heroSet, instances]);

  const meshes = useRef(new Map<string, HeroMesh>());
  const growing = useRef(new Set<string>());
  const wanted = useRef<readonly string[]>([]);
  const pending = useRef<readonly string[]>([]);
  const lastShown = useRef(Number.NEGATIVE_INFINITY);
  const shownKey = useRef("");
  const lastPick = useRef({ at: Number.NEGATIVE_INFINITY, x: Number.NaN, z: Number.NaN });
  const camera = useMemo(() => new THREE.Vector3(), []);
  const live = useRef(true);
  // Set when the picks change or a mesh finishes growing; the frame loop does work only then.
  const dirty = useRef(true);

  const drop = (id: string): void => {
    const hero = meshes.current.get(id);
    if (hero === undefined) return;
    dropHero(hero);
    meshes.current.delete(id);
  };

  useEffect(() => {
    live.current = true;
    const held = meshes.current;
    return () => {
      live.current = false;
      for (const id of [...held.keys()]) drop(id);
    };
  }, []);

  const grow = (id: string): void => {
    const placement = byId.get(id);
    const build = getGeneratorMesh(definition.output);
    if (placement === undefined || build === undefined) return;
    growing.current.add(id);
    const meta = scatterPlacementVariant(definition, item, spec, id).meta;
    prepareGenerator(definition, meta, { detail })
      .then(() => {
        if (!live.current) return;
        const sources = build(runGenerator(definition, meta, { detail })) ?? [];
        const matrix = composeInstance(new THREE.Matrix4(), [placement.x, placement.y, placement.z], [0, placement.rotationY, 0], placement.scale);
        const hero = placeHero(staticDrawPoolFor(scene), sources, matrix);
        meshes.current.set(id, hero);
        scene.add(hero.group);
      })
      .catch((error: unknown) => console.error(`[jgengine] scatter ${item} failed to grow ${id}`, error))
      .finally(() => {
        growing.current.delete(id);
        dirty.current = true;
      });
  };

  useFrame((state) => {
    state.camera.getWorldPosition(camera);
    const now = state.clock.elapsedTime;
    const last = lastPick.current;
    const moved = Number.isNaN(last.x) || Math.hypot(camera.x - last.x, camera.z - last.z) > PICK_MOVE_M;
    if (moved || now - last.at > PICK_INTERVAL_S) {
      lastPick.current = { at: now, x: camera.x, z: camera.z };
      const update = heroSet.update(camera.x, camera.z);
      for (const id of update.evicted) drop(id);
      if (update.changed || update.evicted.length > 0) {
        wanted.current = update.heroes;
        dirty.current = true;
      }
    }
    if (dirty.current) {
      dirty.current = false;
      const shown: string[] = [];
      for (const id of wanted.current) {
        if (meshes.current.has(id)) shown.push(id);
        else if (!growing.current.has(id) && growing.current.size < GROWING_AT_ONCE) grow(id);
      }
      pending.current = shown;
    }
    // Every change of the shown set rebuilds the stand-in field's instance lists, so changes are
    // gathered and handed over at most every SHOW_INTERVAL_S; a hero draws only once its stand-in hides.
    if (now - lastShown.current < SHOW_INTERVAL_S) return;
    const key = pending.current.join("|");
    if (key === shownKey.current) return;
    shownKey.current = key;
    lastShown.current = now;
    const shown = new Set(pending.current);
    for (const [id, hero] of meshes.current) showHero(hero, shown.has(id));
    onShown(shown);
  }, CAMERA_POST_FRAME_PRIORITY + 0.1);

  return null;
}
