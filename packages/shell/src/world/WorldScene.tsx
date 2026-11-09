import { modelWithAuthoredMaterials } from "@jgengine/core/editor/materialAuthoring";
import { modelWithAuthoredNodeVisibility } from "@jgengine/core/editor/modelNodeVisibility";
import { useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import * as THREE from "three";

import { createEmptyEditorDocument, type EditorDocument } from "@jgengine/core/editor/index";
import { hashString } from "@jgengine/core/random/rng";
import { resolveAuthoredObjects } from "@jgengine/core/world/authoredObjects";
import { useLiveEditorDocument } from "@jgengine/core/scene/AuthoredScene.draw";
import { StaticObjectModels, useStaticObjectBatchProbe } from "@jgengine/core/instancing/StaticObjectModels.draw";
import { groupStaticObjects, type StaticObjectBatch } from "@jgengine/core/instancing/staticObjectBatches.draw";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { groundSpeed } from "@jgengine/core/scene/entityStore";
import { objectVisualScale, type ObjectStore, type SceneObject } from "@jgengine/core/scene/objectStore";
import { WORLD_ITEM_ENTITY_NAME } from "@jgengine/core/loot/groundItem";
import type { EntitySpriteConfig, ModelConfig, ObjectStyle } from "@jgengine/core/game/playableGame";
import type { PresencePoseRow } from "@jgengine/core/runtime/transport";
import {
  beginFallbackSeam,
  endFallbackPass,
  reportFallbackSeam,
} from "@jgengine/core/devtools/fallbackSeams";
import { useGameContext } from "@jgengine/react/provider";
import { useSceneEntityIds, useGameStore, usePlayer, useTarget } from "@jgengine/react/hooks";

import { DefaultSurface, detailMaps } from "@jgengine/core/material/defaultSurface.draw";
import { useDisposable } from "@jgengine/core/render/useDisposable.draw";
import { WindClock } from "@jgengine/core/model/modelWind.draw";
import { MeasuredBoundsGroup } from "@jgengine/core/model/measureBounds.draw";
import { EntitySprite, IsolatedEntityModel, useEntityLookModel } from "@jgengine/core/model/SceneModels.draw";
import { CharacterCrowd } from "@jgengine/core/anim/CharacterCrowd.draw";
import {
  CharacterCrowdRegistry,
  crowdEligible,
  crowdKindOf,
  crowdKindReady,
  crowdTintOf,
} from "@jgengine/core/anim/crowdRegistry.draw";
import {
  characterViewTier,
  characterRigTier,
  clearCharacterLodTier,
  setCharacterLodTier,
  type CharacterLodTier,
} from "@jgengine/core/lod/characterLod";
import { resolveEntityModel, resolveObjectModel, type EntityModelCacheEntry, type ObjectModelCacheEntry } from "@jgengine/core/model/resolveModel";
import { modelLooks } from "@jgengine/core/model/modelLook";
import { useRenderVisibility } from "@jgengine/core/visibility/CullingProvider.draw";
import { setCulled } from "@jgengine/core/visibility/culledTransforms.draw";
import { CellStreamingDriver } from "@jgengine/core/visibility/cellStreaming.draw";
import { writePoseIfChanged, writeRenderPoseIfChanged, emptyPoseMemo, type PoseMemo } from "@jgengine/core/anim/entityPose";
import type { RenderPose } from "@jgengine/core/runtime/poseInterpolation";
import { createSnapshotBuffer, type SnapshotBuffer } from "@jgengine/core/runtime/snapshotBuffer";
import { POINTER_ENTITY_KEY, POINTER_OBJECT_KEY } from "@jgengine/core/input/pointerService.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";

/** Deterministic HSL color from a stable instance id (default entity/object tint). */
function colorFromId(id: string): string {
  return `hsl(${hashString(id) % 360}, 65%, 55%)`;
}

const EMPTY_DOCUMENT = createEmptyEditorDocument();
const GROUND_SIZE = 160;
const GROUND_SEGMENTS = 80;

// Memoized: the entity list re-renders whenever one entity comes or goes, and every other marker's
// inputs are unchanged then (entities are updated in place, and their models resolve to one object).
const EntityMarker = memo(function EntityMarker({
  entity,
  custom,
  model: baseModel,
  sprite,
  isLocal,
  targeted,
  selected,
  crowd,
  onSelect,
}: {
  entity: SceneEntity;
  custom: ReactNode | undefined;
  model: ModelConfig | undefined;
  sprite: EntitySpriteConfig | undefined;
  isLocal: boolean;
  targeted: boolean;
  selected: boolean;
  crowd: CharacterCrowdRegistry | undefined;
  onSelect: (entity: SceneEntity) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const ctx = useGameContext();
  const visibleRef = useRenderVisibility();
  const model = useEntityLookModel(baseModel, entity.id);
  const entityId = entity.id;
  const role = entity.role;
  const name = entity.name;
  const color = isLocal ? "#4ade80" : role === "npc" ? colorFromId(name) : "#9ca3af";
  const tierRef = useRef<CharacterLodTier | undefined>(undefined);
  const crowdModel = custom === undefined && !isLocal && crowdEligible(model) && crowd !== undefined ? model : undefined;
  const crowdKind = crowdModel === undefined ? undefined : crowdKindOf(crowdModel);
  const crowdTint = crowdModel === undefined ? undefined : crowdTintOf(crowdModel);

  const scratchRef = useRef<RenderPose>([0, 0, 0, 0]);
  const memoRef = useRef<PoseMemo>(emptyPoseMemo());
  useFrameTask((state) => {
    const group = groupRef.current;
    if (group === null) return;
    const live = ctx.scene.entity.get(entityId);
    if (live === null) return;
    writeRenderPoseIfChanged(group, ctx, entityId, live, scratchRef.current, memoRef.current);
    const inView = visibleRef.current(entityId);
    const shown = live.hidden !== true && inView;
    let batched = false;
    const [x, y, z] = live.position;
    const distance = Math.sqrt(
      (state.camera.position.x - x) ** 2 + (state.camera.position.y - y) ** 2 + (state.camera.position.z - z) ** 2,
    );
    const crowdReady = crowdModel !== undefined && crowd !== undefined && crowdKind !== undefined && crowdKindReady(crowdKind);
    let tier = characterViewTier({ shown, local: isLocal, lod: model?.lod, distance, crowd: crowdReady, previous: tierRef.current });
    if (tier === "crowd" && crowd !== undefined && crowdKind !== undefined) {
      // A painted character keeps its own rig: its strokes live on its materials, not in the batch.
      const painted = ctx.scene.entity.paint.version(entityId) !== 0;
      batched = !painted && crowd.claim(entityId, crowdKind, { x, y, z, rotationY: live.rotationY ?? 0, speed: groundSpeed(live), size: live.size ?? 1, tint: crowdTint });
      // An over-cap batch leaves the rest of its kind on their own rigs at the tier their distance
      // earns, so a crowded scene loses draws rather than characters.
      if (!batched) tier = characterRigTier(distance, model?.lod === false ? undefined : model?.lod);
    }
    setCharacterLodTier(entityId, tier);
    if (!batched) crowd?.delete(entityId);
    tierRef.current = tier;
    // The marker itself stays mounted and visible while a batch draws the character: its status
    // rings and the hit test on its rig have to behave as they do when it draws itself.
    if (modelRef.current !== null) {
      modelRef.current.visible = !batched;
      // A per-instance size (a baby growing up) scales the model about its feet.
      modelRef.current.scale.setScalar(live.size ?? 1);
    }
    group.visible = shown;
    setCulled(group, !inView);
  });

  useEffect(
    () => () => {
      crowd?.delete(entityId);
      clearCharacterLodTier(entityId);
    },
    [crowd, entityId],
  );

  return (
    <group
      ref={groupRef}
      matrixAutoUpdate={false}
      userData={{ [POINTER_ENTITY_KEY]: entityId }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (isLocal) return;
        const live = ctx.scene.entity.get(entityId);
        if (live !== null) onSelect(live);
      }}
    >
      {selected ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
          <ringGeometry args={[0.8, 0.95, 32]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.9} />
        </mesh>
      ) : null}
      <group ref={modelRef}>
        {custom !== undefined && custom !== null ? (
          <MeasuredBoundsGroup target="entity" measureKey={name}>
            {custom}
          </MeasuredBoundsGroup>
        ) : model !== undefined ? (
          <IsolatedEntityModel
            model={model}
            instanceId={entityId}
            measure={{ target: "entity", key: name }}
            sprite={sprite}
          />
        ) : sprite !== undefined ? (
          <EntitySprite sprite={sprite} />
        ) : role === "prop" ? (
          <mesh position-y={0.5} castShadow receiveShadow>
            <sphereGeometry args={[0.45, 24, 24]} />
            <DefaultSurface color={color} />
          </mesh>
        ) : (
          <group scale={ctx.scene.entity.visualScaleOf(entityId)}>
            <mesh position-y={0.95} castShadow receiveShadow>
              <capsuleGeometry args={[0.35, 1.1, 6, 14]} />
              <DefaultSurface color={color} roughness={0.6} />
            </mesh>
            <mesh position={[0, 1.35, 0.32]}>
              <boxGeometry args={[0.16, 0.16, 0.16]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>
          </group>
        )}
      </group>
      {targeted ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
          <ringGeometry args={[0.6, 0.75, 28]} />
          <meshBasicMaterial color="#f87171" />
        </mesh>
      ) : null}
    </group>
  );
});

/**
 * Whether an object draws its catalog model through a per-placement scale group. A scaled
 * placement skips the per-catalog bounds measurement, which would otherwise record one instance's
 * stretched size as every instance's footprint.
 * @capability scaled-object-model stretch one placement of a catalog model with visual.scale
 */
export function drawsScaledModel(object: Pick<SceneObject, "visual">): boolean {
  return object.visual?.scale !== undefined;
}

const ObjectMarker = memo(function ObjectMarker({
  object,
  custom,
  model,
  style,
}: {
  object: SceneObject;
  custom: ReactNode | undefined;
  model: ModelConfig | undefined;
  style: ObjectStyle | undefined;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ctx = useGameContext();
  const visibleRef = useRenderVisibility();
  const instanceId = object.instanceId;
  const memoRef = useRef<PoseMemo>(emptyPoseMemo());
  const [scaleX, scaleY, scaleZ] = objectVisualScale(object.visual);
  const color = object.visual?.color ?? style?.color ?? colorFromId(object.catalogId);
  const opacity = object.visual?.opacity ?? style?.opacity ?? 1;

  useFrameTask(() => {
    const group = groupRef.current;
    if (group === null) return;
    const live = ctx.scene.object.get(instanceId);
    // Removed: the object list does not re-render for a removal, so the marker hides itself.
    if (live === null) {
      group.visible = false;
      return;
    }
    writePoseIfChanged(group, live, memoRef.current);
    group.visible = visibleRef.current(instanceId);
    setCulled(group, !group.visible);
  });

  return (
    <group ref={groupRef} matrixAutoUpdate={false} userData={{ [POINTER_OBJECT_KEY]: instanceId }}>
      {custom !== undefined && custom !== null ? (
        <MeasuredBoundsGroup target="object" measureKey={object.catalogId}>
          {custom}
        </MeasuredBoundsGroup>
      ) : model !== undefined ? (
        !drawsScaledModel(object) ? (
          <IsolatedEntityModel model={model} instanceId={instanceId} measure={{ target: "object", key: object.catalogId }} />
        ) : (
          <group scale={[scaleX, scaleY, scaleZ]}>
            <IsolatedEntityModel model={model} instanceId={instanceId} />
          </group>
        )
      ) : style?.hidden === true ? null : (
        <mesh position-y={0.5 * scaleY} scale={[scaleX, scaleY, scaleZ]} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <DefaultSurface color={color} transparent={opacity < 1} opacity={opacity} />
        </mesh>
      )}
    </group>
  );
});

function GroundPlane() {
  const geometry = useMemo(() => {
    const next = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS);
    const positions = next.getAttribute("position");
    const base = new THREE.Color("#33452f");
    const high = new THREE.Color("#4a5c3a");
    const colors = new Float32Array(positions.count * 3);
    const tmp = new THREE.Color();
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const height =
        Math.sin(x * 0.16) * 0.12 +
        Math.cos(y * 0.11) * 0.1 +
        Math.sin((x + y) * 0.05) * 0.16;
      positions.setZ(index, height);
      const blend = 0.5 + Math.sin(x * 0.21) * 0.25 + Math.cos(y * 0.17) * 0.25;
      tmp.copy(base).lerp(high, Math.min(1, Math.max(0, blend)));
      colors[index * 3] = tmp.r;
      colors[index * 3 + 1] = tmp.g;
      colors[index * 3 + 2] = tmp.b;
    }
    next.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    next.computeVertexNormals();
    return next;
  }, []);
  const material = useDisposable(() => {
    const normal = detailMaps().normal.clone();
    normal.repeat.set(48, 48);
    normal.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      envMapIntensity: 0.4,
    });
  }, []);

  return <mesh rotation-x={-Math.PI / 2} geometry={geometry} material={material} receiveShadow />;
}

function RockField() {
  const rocks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => {
        const angle = index * 2.399963229728653;
        const radius = 10 + ((index * 17) % 58);
        return {
          id: `rock-${index}`,
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          scale: 0.45 + ((index * 13) % 11) / 10,
          rotation: angle,
        };
      }),
    [],
  );

  return (
    <>
      {rocks.map((rock) => (
        <mesh
          key={rock.id}
          position={[rock.x, 0.25 * rock.scale, rock.z]}
          rotation={[0.1, rock.rotation, -0.08]}
          scale={[rock.scale * 1.4, rock.scale * 0.7, rock.scale]}
          castShadow
          receiveShadow
        >
          <dodecahedronGeometry args={[0.8, 1]} />
          <DefaultSurface color="#6b6f63" roughness={0.95} />
        </mesh>
      ))}
    </>
  );
}

function WorldEnvironment({ environment: Environment }: { environment: ComponentType | undefined }) {
  // Dev diagnostic (no-op unless armed): a missing environment component means the default green
  // ground/rocks stand in for an unauthored scene. Re-zero then report so this is idempotent.
  beginFallbackSeam("ground");
  if (Environment !== undefined) return <Environment />;
  reportFallbackSeam("ground", "noScene");
  return (
    <>
      <GroundPlane />
      <RockField />
    </>
  );
}

/**
 * The scene's entities. Kept apart from {@link WorldObjects} so a car or a passer-by coming and going
 * re-renders this list alone, and each marker only when its own inputs change, instead of regrouping
 * every static object in the world: the cost of a membership change follows what changed.
 */
function WorldEntities({
  entitySprites,
  entityModels,
  assets,
  renderEntity,
  selectedIds,
  hideLocalActor,
}: {
  entitySprites: Record<string, EntitySpriteConfig> | undefined;
  entityModels: Record<string, string | ModelConfig> | undefined;
  assets: AssetCatalog;
  renderEntity: ((entity: SceneEntity) => ReactNode) | undefined;
  selectedIds: ReadonlySet<string>;
  hideLocalActor: boolean;
}) {
  const ctx = useGameContext();
  const entityIds = useSceneEntityIds();
  const modelCache = useMemo(() => new Map<string, EntityModelCacheEntry>(), [entityModels, assets]);
  const player = usePlayer();
  const targetId = useTarget(player.userId);
  const controlledId = useGameStore((c) => c.player.possession.active(player.userId));
  const crowdRegistry = useMemo(() => new CharacterCrowdRegistry(), []);
  const handleSelect = useCallback(
    (entity: SceneEntity) => {
      const relation = ctx.scene.entity.canReceive(entity.id, "damage") === null ? "hostile" : "friendly";
      ctx.scene.entity.setTarget(ctx.player.possession.active(player.userId), relation === "hostile" || entity.role === "npc" ? entity.id : null);
    },
    [ctx, player.userId],
  );
  // Dev diagnostic (no-op unless armed): re-zero the entity seam before this render re-tallies which
  // actors fall back to primitives. Committing the log runs in a useEffect after the render.
  beginFallbackSeam("entity");
  useEffect(() => {
    endFallbackPass();
  });
  const crowdModels = new Map<string, ModelConfig>();
  const markers = entityIds.map((entityId) => {
    const entity = ctx.scene.entity.get(entityId);
    if (entity === null || entity.name === WORLD_ITEM_ENTITY_NAME) return null;
    if (hideLocalActor && entityId === controlledId) return null;
    const custom = renderEntity?.(entity);
    const model = resolveEntityModel(entityModels?.[entity.name], assets, entity.name, modelCache);
    const sprite = entitySprites?.[entity.name];
    // Entity models resolve via the hard resolveModel (throws on a present-but-missing id), so
    // reaching the primitive capsule with no model or sprite means the mapping was omitted.
    if ((custom === undefined || custom === null) && model === undefined && sprite === undefined) {
      reportFallbackSeam("entity", "omittedMapping");
    }
    for (const body of model === undefined ? [] : modelLooks(model)) if (crowdEligible(body)) crowdModels.set(crowdKindOf(body), body);
    return (
      <EntityMarker
        key={entityId}
        entity={entity}
        custom={custom}
        model={model}
        sprite={sprite}
        isLocal={entityId === controlledId}
        targeted={entityId === targetId}
        selected={selectedIds.has(entityId)}
        crowd={crowdRegistry}
        onSelect={handleSelect}
      />
    );
  });
  return (
    <>
      {markers}
      {crowdModels.size > 0 ? (
        <CharacterCrowd
          models={[...crowdModels.values()]}
          registry={crowdRegistry}
          onPick={(entityId) => {
            const live = ctx.scene.entity.get(entityId);
            if (live !== null) handleSelect(live);
          }}
        />
      ) : null}
    </>
  );
}

/** The scene's placed objects: one draw per batch of alike static props, and a marker for the rest. */
/**
 * The placed object ids as of the last placement. Removals alone keep the same list: a batch keeps a
 * removed member, which draws nothing, and a lone prop's marker hides itself once its object is gone,
 * so clearing props away re-renders nothing. The list may name removed objects until the next placement.
 * @internal
 */
export function placedObjectIds(store: Pick<ObjectStore, "ids" | "placements">): () => readonly string[] {
  let seen = -1;
  let ids: readonly string[] = [];
  return () => {
    const placements = store.placements();
    if (placements !== seen) {
      seen = placements;
      ids = store.ids();
    }
    return ids;
  };
}

function WorldObjects({
  objectModels,
  objectStyles,
  assets,
  renderObject,
  editorLayers,
}: {
  objectModels: Record<string, string | ModelConfig> | undefined;
  objectStyles: Record<string, ObjectStyle> | undefined;
  assets: AssetCatalog;
  renderObject: ((object: SceneObject) => ReactNode) | undefined;
  editorLayers?: EditorDocument | undefined;
}) {
  const ctx = useGameContext();
  const scene = useThree((state) => state.scene);
  const readIds = useMemo(() => placedObjectIds(ctx.scene.object), [ctx]);
  const objectIds = useSyncExternalStore(ctx.scene.object.subscribeMembership, readIds, readIds);
  const document = useLiveEditorDocument(editorLayers ?? EMPTY_DOCUMENT, editorLayers !== undefined);
  const materialMarkers = useMemo(() => new Map(document.markers.map((marker) => [marker.id, marker])), [document]);
  const authoredIds = useMemo(() => new Set(resolveAuthoredObjects(document).map((object) => object.instanceId)), [document]);
  const batchCache = useRef(new Map<string, StaticObjectBatch>());
  const modelCache = useMemo(() => new Map<string, ObjectModelCacheEntry>(), [objectModels, assets]);
  useEffect(() => {
    endFallbackPass();
  });
  // Regrouped only when a placement or an input changed what the grouping was built from.
  const grouping = useRef<{ inputs: readonly unknown[]; grouped: ReturnType<typeof groupStaticObjects> } | null>(null);
  const inputs = [objectIds, ctx, objectModels, assets, modelCache, document, materialMarkers, authoredIds, renderObject, objectStyles];
  let grouped = grouping.current !== null && grouping.current.inputs.every((value, index) => value === inputs[index]) ? grouping.current.grouped : null;
  if (grouped === null) {
    beginFallbackSeam("object");
    const candidates = objectIds.flatMap((instanceId) => {
      const object = ctx.scene.object.get(instanceId);
      if (object === null) return [];
      const custom = renderObject?.(object);
      const marker = materialMarkers.get(object.instanceId);
      const model = modelWithAuthoredNodeVisibility(modelWithAuthoredMaterials(resolveObjectModel(object, objectModels, assets, modelCache), { materialAssets: document.materialAssets, markers: marker === undefined ? [] : [marker] }, object.instanceId), marker);
      const style = objectStyles?.[object.catalogId];
      // Reaching the primitive box means no model resolved. A present-but-unresolved objectModels
      // key implies its asset pack is not pulled; an absent key is an omitted (often intended) mapping.
      if ((custom === undefined || custom === null) && model === undefined && style?.hidden !== true) {
        reportFallbackSeam("object", objectModels?.[object.catalogId] === undefined ? "omittedMapping" : "unpulledPack");
      }
      return [{ object, model, custom: custom !== undefined && custom !== null, style, authored: authoredIds.has(instanceId), catalog: ctx.scene.object.catalog(instanceId) }];
    });
    grouped = groupStaticObjects(candidates, batchCache.current);
    batchCache.current = new Map(grouped.batches.map((batch) => [batch.key, batch]));
  }
  grouping.current = { inputs, grouped };
  useStaticObjectBatchProbe(scene, {
    batches: grouped.batches.length,
    instances: grouped.batches.reduce((total, batch) => total + batch.objects.length, 0),
    singles: grouped.singles.length,
  });
  // One renderer while its inputs hold, so a placement or removal re-renders only the batches it
  // changed, not every batch in the world.
  const renderSingle = useCallback((object: SceneObject) => {
    // A batch can still hold an object removed since it was grouped (a streamed-out block's props):
    // a removed object draws nothing.
    const live = ctx.scene.object.get(object.instanceId);
    if (live === null) return null;
    const marker = materialMarkers.get(live.instanceId);
    const model = modelWithAuthoredNodeVisibility(modelWithAuthoredMaterials(resolveObjectModel(live, objectModels, assets, modelCache), { materialAssets: document.materialAssets, markers: marker === undefined ? [] : [marker] }, live.instanceId), marker);
    return <ObjectMarker key={live.instanceId} object={live} custom={renderObject?.(live)} model={model} style={objectStyles?.[live.catalogId]} />;
  }, [ctx, materialMarkers, objectModels, assets, modelCache, document, renderObject, objectStyles]);
  const modelUrls = () => {
    const urls = new Set<string>();
    for (const catalogId of Object.keys(objectModels ?? {})) {
      const url = resolveObjectModel({ instanceId: "", catalogId, position: [0, 0, 0], rotationY: 0 }, objectModels, assets, modelCache)?.url;
      if (url !== undefined) urls.add(url);
    }
    return [...urls];
  };
  return (
    <>
      <CellStreamingDriver modelUrls={modelUrls} />
      {grouped.singles.map((candidate) => renderSingle(candidate.object))}
      {grouped.batches.map((batch) => <StaticObjectModels key={batch.key} batch={batch} single={renderSingle} />)}
    </>
  );
}

export function WorldView({
  entitySprites,
  entityModels,
  objectModels,
  objectStyles,
  environment,
  assets,
  renderEntity,
  renderObject,
  selectedIds,
  hideLocalActor,
  editorLayers,
}: {
  entitySprites: Record<string, EntitySpriteConfig> | undefined;
  entityModels: Record<string, string | ModelConfig> | undefined;
  objectModels: Record<string, string | ModelConfig> | undefined;
  objectStyles: Record<string, ObjectStyle> | undefined;
  environment: ComponentType | undefined;
  assets: AssetCatalog;
  renderEntity: ((entity: SceneEntity) => ReactNode) | undefined;
  renderObject: ((object: SceneObject) => ReactNode) | undefined;
  selectedIds: ReadonlySet<string>;
  hideLocalActor: boolean;
  editorLayers?: EditorDocument | undefined;
}) {
  return (
    <>
      <WindClock />
      <WorldEnvironment environment={environment} />
      <WorldEntities
        entitySprites={entitySprites}
        entityModels={entityModels}
        assets={assets}
        renderEntity={renderEntity}
        selectedIds={selectedIds}
        hideLocalActor={hideLocalActor}
      />
      <WorldObjects objectModels={objectModels} objectStyles={objectStyles} assets={assets} renderObject={renderObject} editorLayers={editorLayers} />
    </>
  );
}

export function RemotePlayers({ rows, presenceInterpolationMs = 100 }: { rows: PresencePoseRow[]; presenceInterpolationMs?: number }) {  const groups = useRef(new Map<string, THREE.Group>());
  const buffers = useRef(new Map<string, SnapshotBuffer<PresencePoseRow>>());
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    const active = new Set(rows.map((row) => row.userId));
    for (const row of rows) {
      let buffer = buffers.current.get(row.userId);
      if (buffer === undefined) {
        buffer = createSnapshotBuffer({ delayMs: presenceInterpolationMs, capacity: 16 });
        buffers.current.set(row.userId, buffer);
      } else {
        buffer.retune({ delayMs: presenceInterpolationMs });
      }
      buffer.push(row.lastSeenAt, row);
    }
    for (const userId of buffers.current.keys()) {
      if (!active.has(userId)) buffers.current.delete(userId);
    }
  }, [rows, presenceInterpolationMs]);
  useFrameTask(({ clock }) => {
    const now = clock.getElapsedTime() * 1000;
    for (const [userId, buffer] of buffers.current) {
      const group = groups.current.get(userId);
      const sample = buffer.sampleAt(now);
      if (group === undefined || sample === null) continue;
      const before = sample.before;
      const after = sample.after;
      group.position.set(
        before.position.x + (after.position.x - before.position.x) * sample.alpha,
        before.position.y + (after.position.y - before.position.y) * sample.alpha,
        before.position.z + (after.position.z - before.position.z) * sample.alpha,
      );
      group.rotation.y = before.rotationY + (after.rotationY - before.rotationY) * sample.alpha;
    }
  });
  return (
    <>
      {rows.map((row) => (
        <group
          key={row.userId}
          ref={(group) => {
            if (group === null) groups.current.delete(row.userId);
            else groups.current.set(row.userId, group);
          }}
        >
          <mesh position-y={0.95}>
            <capsuleGeometry args={[0.35, 1.1, 6, 14]} />
            <meshStandardMaterial color={colorFromId(row.userId)} />
          </mesh>
          <mesh position={[0, 1.35, 0.32]}>
            <boxGeometry args={[0.16, 0.16, 0.16]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        </group>
      ))}
    </>
  );
}

