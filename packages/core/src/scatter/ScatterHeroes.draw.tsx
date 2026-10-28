import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { prepareGenerator, runGenerator, type GeneratorDefinition } from "@jgengine/core/generator/generator";
import { getGeneratorMesh } from "@jgengine/core/generator/generatorMesh.draw";
import { composeInstance } from "@jgengine/core/instancing/instanceUpload.draw";
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

interface HeroMesh {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
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
 * The near placements of a unique scatter species, each grown from its own seed and drawn as its own
 * mesh. Placements are picked by {@link createScatterHeroSet}, grown a few at a time (off the main
 * thread where the generator prepares there), and a stand-in is hidden only once its own mesh is
 * ready, so nothing pops out while a tree grows.
 * @internal
 */
export function ScatterHeroes({ item, definition, spec, instances, onShown }: ScatterHeroesProps) {
  const root = useRef<THREE.Group>(null);
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
    const mesh = meshes.current.get(id);
    if (mesh === undefined) return;
    mesh.group.removeFromParent();
    for (const geometry of mesh.geometries) geometry.dispose();
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
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        composeInstance(group.matrix, [placement.x, placement.y, placement.z], [0, placement.rotationY, 0], placement.scale);
        group.visible = false;
        const geometries: THREE.BufferGeometry[] = [];
        for (const source of sources) {
          if (source.geometry.boundingSphere === null) source.geometry.computeBoundingSphere();
          const mesh = new THREE.Mesh(source.geometry, source.material);
          mesh.castShadow = source.castShadow ?? (source.geometry.boundingSphere?.radius ?? 1) >= SMALL_SHADOW_RADIUS;
          mesh.receiveShadow = source.receiveShadow ?? true;
          group.add(mesh);
          geometries.push(source.geometry);
        }
        meshes.current.set(id, { group, geometries });
        root.current?.add(group);
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
    for (const [id, mesh] of meshes.current) mesh.group.visible = shown.has(id);
    onShown(shown);
  }, CAMERA_POST_FRAME_PRIORITY + 0.1);

  return <group ref={root} />;
}
