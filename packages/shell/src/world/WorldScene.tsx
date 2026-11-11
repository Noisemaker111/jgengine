/** @jsxImportSource @jgengine/core/ui/jsx */
import { modelWithAuthoredMaterials } from "@jgengine/core/editor/materialAuthoring";
import { modelWithAuthoredNodeVisibility } from "@jgengine/core/editor/modelNodeVisibility";
import { memo, useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ComponentType, type MutableRefObject, type ReactNode } from "@jgengine/core/ui/jsx";
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
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import {
  beginFallbackSeam,
  endFallbackPass,
  reportFallbackSeam,
} from "@jgengine/core/devtools/fallbackSeams";
import { useGameContext } from "@jgengine/react/provider";
import { useSceneEntityIds, useGameStore, usePlayer, useTarget } from "@jgengine/react/hooks";

import { defaultSurfaceMaterial, detailMaps } from "@jgengine/core/material/defaultSurface.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw, SceneObjectPortal, mountChildDraw, unmountChildDraw, type MountedChildDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { WindClock } from "@jgengine/core/model/modelWind.draw";
import { MeasuredBoundsGroup } from "@jgengine/core/model/measureBounds.draw";
import { useEntityLookModel } from "@jgengine/core/model/SceneModels.draw";
import { entitySpriteDraw, isolatedEntityModelDraw } from "@jgengine/core/model/entityModelDraw.draw";
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
import { useRenderVisibility, type VisiblePredicate } from "@jgengine/core/visibility/CullingProvider.draw";
import { setCulled } from "@jgengine/core/visibility/culledTransforms.draw";
import { CellStreamingDriver } from "@jgengine/core/visibility/cellStreaming.draw";
import { writePoseIfChanged, writeRenderPoseIfChanged, emptyPoseMemo, type PoseMemo } from "@jgengine/core/anim/entityPose";
import type { RenderPose } from "@jgengine/core/runtime/poseInterpolation";
import { createSnapshotBuffer, type SnapshotBuffer } from "@jgengine/core/runtime/snapshotBuffer";
import { POINTER_ENTITY_KEY, POINTER_OBJECT_KEY } from "@jgengine/core/input/pointerService.draw";

/** Deterministic HSL color from a stable instance id (default entity/object tint). */
function colorFromId(id: string): string {
  return `hsl(${hashString(id) % 360}, 65%, 55%)`;
}

const EMPTY_DOCUMENT = createEmptyEditorDocument();
const GROUND_SIZE = 160;
const GROUND_SEGMENTS = 80;

/** Add `root` under `parent` now; `dispose` removes it and disposes every mesh's geometry and material. */
function trackedVisual(parent: THREE.Object3D, root: THREE.Object3D): { dispose(): void } {
  parent.add(root);
  return {
    dispose() {
      parent.remove(root);
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh === true) {
          mesh.geometry.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) for (const entry of material) entry.dispose();
          else material.dispose();
        }
      });
    },
  };
}

interface EntityMarkerSnapshot {
  /** Custom UI content claimed this entity (never `null`/`undefined`). */
  hasCustom: boolean;
  /** `renderEntity` was absent entirely (`undefined`), which alone gates crowd batching. */
  customMissing: boolean;
  model: ModelConfig | undefined;
  sprite: EntitySpriteConfig | undefined;
  prop: boolean;
  color: string;
  isLocal: boolean;
  targeted: boolean;
  selected: boolean;
}

type EntityVisualKind = "custom" | "model" | "sprite" | "prop" | "capsule";

/**
 * One entity's marker as an {@link EngineDraw}: pose writes, render visibility, culling, crowd
 * batching and LOD tiers in `frame`; selection/target rings and the visual branch (custom portal,
 * model, sprite, or primitive fallback) reconciled in `update`. `markerRoot` and `contentGroup`
 * are UI-created so {@link SceneObjectPortal} can parent custom content under them on either
 * host; the draw adds `contentGroup` under `markerRoot` itself.
 */
function entityMarkerDraw(options: {
  entityId: string;
  measureKey: string;
  ctx: GameContext;
  visible: MutableRefObject<VisiblePredicate>;
  latest: { current: EntityMarkerSnapshot };
  crowd: CharacterCrowdRegistry | undefined;
  markerRoot: THREE.Group;
  contentGroup: THREE.Group;
}): EngineDraw {
  const { entityId, measureKey, ctx, visible, latest, crowd, markerRoot, contentGroup } = options;
  markerRoot.userData[POINTER_ENTITY_KEY] = entityId;
  markerRoot.matrixAutoUpdate = false;
  markerRoot.add(contentGroup);

  const selectedRing = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 0.95, 32),
    new THREE.MeshBasicMaterial({ color: "#34d399", transparent: true, opacity: 0.9 }),
  );
  selectedRing.rotation.x = -Math.PI / 2;
  selectedRing.position.y = 0.02;
  selectedRing.visible = false;
  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.75, 28),
    new THREE.MeshBasicMaterial({ color: "#f87171" }),
  );
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.03;
  targetRing.visible = false;
  markerRoot.add(selectedRing, targetRing);

  const scratch: RenderPose = [0, 0, 0, 0];
  const memo: PoseMemo = emptyPoseMemo();
  let tierRef: CharacterLodTier | undefined;
  let child: MountedChildDraw | null = null;
  let visual: { dispose(): void } | null = null;
  let built: { kind: EntityVisualKind; model: ModelConfig | undefined; sprite: EntitySpriteConfig | undefined; color: string } | null = null;
  let scaledGroup: THREE.Group | null = null;
  let crowdModel: ModelConfig | undefined;
  let crowdKind: string | undefined;
  let crowdTint: string | undefined;

  const teardownVisual = () => {
    if (child !== null) {
      unmountChildDraw(child);
      child = null;
    }
    visual?.dispose();
    visual = null;
    scaledGroup = null;
    built = null;
  };

  const syncVisual = (state: EngineFrameState) => {
    const snap = latest.current;
    selectedRing.visible = snap.selected;
    targetRing.visible = snap.targeted;

    const cModel = snap.customMissing && !snap.isLocal && snap.model !== undefined && crowd !== undefined && crowdEligible(snap.model) ? snap.model : undefined;
    crowdModel = cModel;
    crowdKind = cModel === undefined ? undefined : crowdKindOf(cModel);
    crowdTint = cModel === undefined ? undefined : crowdTintOf(cModel);

    const kind: EntityVisualKind = snap.hasCustom
      ? "custom"
      : snap.model !== undefined
        ? "model"
        : snap.sprite !== undefined
          ? "sprite"
          : snap.prop
            ? "prop"
            : "capsule";
    if (
      built !== null &&
      built.kind === kind &&
      built.model === snap.model &&
      built.sprite === snap.sprite &&
      (kind === "model" || kind === "sprite" || kind === "custom" || built.color === snap.color)
    ) {
      if (scaledGroup !== null) scaledGroup.scale.setScalar(ctx.scene.entity.visualScaleOf(entityId));
      return;
    }
    teardownVisual();
    built = { kind, model: snap.model, sprite: snap.sprite, color: snap.color };

    if (kind === "model" && snap.model !== undefined) {
      const sprite = snap.sprite;
      child = mountChildDraw(
        isolatedEntityModelDraw({
          model: snap.model,
          instanceId: entityId,
          measure: { target: "entity", key: measureKey },
          ctx,
          seam: "entity",
          fallback: sprite === undefined ? undefined : () => entitySpriteDraw(sprite),
        }),
        contentGroup,
        state,
      );
      return;
    }
    if (kind === "sprite" && snap.sprite !== undefined) {
      child = mountChildDraw(entitySpriteDraw(snap.sprite), contentGroup, state);
      return;
    }
    if (kind === "custom") return;

    if (kind === "prop") {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 24, 24),
        defaultSurfaceMaterial({ color: snap.color }),
      );
      mesh.position.y = 0.5;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      visual = trackedVisual(contentGroup, mesh);
      return;
    }
    const inner = new THREE.Group();
    inner.scale.setScalar(ctx.scene.entity.visualScaleOf(entityId));
    scaledGroup = inner;
    const capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.1, 6, 14),
      defaultSurfaceMaterial({ color: snap.color, roughness: 0.6 }),
    );
    capsule.position.y = 0.95;
    capsule.castShadow = true;
    capsule.receiveShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshStandardMaterial({ color: "#f8fafc" }));
    head.position.set(0, 1.35, 0.32);
    inner.add(capsule, head);
    visual = trackedVisual(contentGroup, inner);
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(markerRoot);
      syncVisual(state);
    },
    update(state: EngineFrameState) {
      syncVisual(state);
    },
    frame(state: EngineFrameState) {
      const live = ctx.scene.entity.get(entityId);
      if (live === null) return;
      writeRenderPoseIfChanged(markerRoot, ctx, entityId, live, scratch, memo);
      const inView = visible.current(entityId);
      const shown = live.hidden !== true && inView;
      let batched = false;
      const [x, y, z] = live.position;
      const distance = Math.sqrt(
        (state.camera.position.x - x) ** 2 + (state.camera.position.y - y) ** 2 + (state.camera.position.z - z) ** 2,
      );
      const snap = latest.current;
      const crowdReady = crowdModel !== undefined && crowd !== undefined && crowdKind !== undefined && crowdKindReady(crowdKind);
      let tier = characterViewTier({ shown, local: snap.isLocal, lod: snap.model?.lod, distance, crowd: crowdReady, previous: tierRef });
      if (tier === "crowd" && crowd !== undefined && crowdKind !== undefined) {
        // A painted character keeps its own rig: its strokes live on its materials, not in the batch.
        const painted = ctx.scene.entity.paint.version(entityId) !== 0;
        batched = !painted && crowd.claim(entityId, crowdKind, { x, y, z, rotationY: live.rotationY ?? 0, speed: groundSpeed(live), size: live.size ?? 1, tint: crowdTint });
        // An over-cap batch leaves the rest of its kind on their own rigs at the tier their distance
        // earns, so a crowded scene loses draws rather than characters.
        if (!batched) tier = characterRigTier(distance, snap.model?.lod === false ? undefined : snap.model?.lod);
      }
      setCharacterLodTier(entityId, tier);
      if (!batched) crowd?.delete(entityId);
      tierRef = tier;
      // The marker itself stays mounted and visible while a batch draws the character: its status
      // rings and the hit test on its rig have to behave as they do when it draws itself.
      contentGroup.visible = !batched;
      // A per-instance size (a baby growing up) scales the model about its feet.
      contentGroup.scale.setScalar(live.size ?? 1);
      markerRoot.visible = shown;
      setCulled(markerRoot, !inView);
    },
    dispose(state: EngineFrameState) {
      teardownVisual();
      crowd?.delete(entityId);
      clearCharacterLodTier(entityId);
      markerRoot.remove(contentGroup);
      markerRoot.remove(selectedRing, targetRing);
      selectedRing.geometry.dispose();
      (selectedRing.material as THREE.Material).dispose();
      targetRing.geometry.dispose();
      (targetRing.material as THREE.Material).dispose();
      state.scene.remove(markerRoot);
    },
  };
}

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
}: {
  entity: SceneEntity;
  custom: ReactNode | undefined;
  model: ModelConfig | undefined;
  sprite: EntitySpriteConfig | undefined;
  isLocal: boolean;
  targeted: boolean;
  selected: boolean;
  crowd: CharacterCrowdRegistry | undefined;
}) {
  const ctx = useGameContext();
  const visibleRef = useRenderVisibility();
  const model = useEntityLookModel(baseModel, entity.id);
  const markerRoot = useMemo(() => new THREE.Group(), []);
  const contentGroup = useMemo(() => new THREE.Group(), []);
  const latest = useRef<EntityMarkerSnapshot>({
    hasCustom: false,
    customMissing: true,
    model: undefined,
    sprite: undefined,
    prop: false,
    color: "#9ca3af",
    isLocal: false,
    targeted: false,
    selected: false,
  });
  const color = isLocal ? "#4ade80" : entity.role === "npc" ? colorFromId(entity.name) : "#9ca3af";
  latest.current = {
    hasCustom: custom !== undefined && custom !== null,
    customMissing: custom === undefined,
    model,
    sprite,
    prop: entity.role === "prop",
    color,
    isLocal,
    targeted,
    selected,
  };
  useEngineDraw(
    () =>
      entityMarkerDraw({
        entityId: entity.id,
        measureKey: entity.name,
        ctx,
        visible: visibleRef,
        latest,
        crowd,
        markerRoot,
        contentGroup,
      }),
    [entity.id, entity.name, entity.role, ctx, visibleRef, latest, crowd, markerRoot, contentGroup],
  );
  return (
    <SceneObjectPortal object={markerRoot}>
      {custom !== undefined && custom !== null ? (
        <SceneObjectPortal object={contentGroup}>
          <MeasuredBoundsGroup target="entity" measureKey={entity.name}>
            {custom}
          </MeasuredBoundsGroup>
        </SceneObjectPortal>
      ) : null}
    </SceneObjectPortal>
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

interface ObjectMarkerSnapshot {
  hasCustom: boolean;
  model: ModelConfig | undefined;
  hidden: boolean;
  drawsScaled: boolean;
  scale: readonly [number, number, number];
  color: string;
  opacity: number;
}

type ObjectVisualKind = "custom" | "model" | "modelScaled" | "hidden" | "box";

function objectMarkerDraw(options: {
  instanceId: string;
  catalogId: string;
  ctx: GameContext;
  visible: MutableRefObject<VisiblePredicate>;
  latest: { current: ObjectMarkerSnapshot };
  markerRoot: THREE.Group;
}): EngineDraw {
  const { instanceId, catalogId, ctx, visible, latest, markerRoot } = options;
  markerRoot.userData[POINTER_OBJECT_KEY] = instanceId;
  markerRoot.matrixAutoUpdate = false;

  const memo: PoseMemo = emptyPoseMemo();
  let child: MountedChildDraw | null = null;
  let visual: { dispose(): void } | null = null;
  let scaledGroup: THREE.Group | null = null;
  let built: { kind: ObjectVisualKind; model: ModelConfig | undefined; scale: readonly [number, number, number]; color: string; opacity: number } | null = null;

  const teardownVisual = () => {
    if (child !== null) {
      unmountChildDraw(child);
      child = null;
    }
    visual?.dispose();
    visual = null;
    if (scaledGroup !== null) markerRoot.remove(scaledGroup);
    scaledGroup = null;
    built = null;
  };

  const syncVisual = (state: EngineFrameState) => {
    const snap = latest.current;
    const kind: ObjectVisualKind = snap.hasCustom
      ? "custom"
      : snap.model !== undefined
        ? snap.drawsScaled
          ? "modelScaled"
          : "model"
        : snap.hidden
          ? "hidden"
          : "box";
    if (
      built !== null &&
      built.kind === kind &&
      built.model === snap.model &&
      built.scale[0] === snap.scale[0] &&
      built.scale[1] === snap.scale[1] &&
      built.scale[2] === snap.scale[2] &&
      built.color === snap.color &&
      built.opacity === snap.opacity
    ) {
      return;
    }
    teardownVisual();
    built = { kind, model: snap.model, scale: snap.scale, color: snap.color, opacity: snap.opacity };

    if (kind === "model" && snap.model !== undefined) {
      child = mountChildDraw(
        isolatedEntityModelDraw({
          model: snap.model,
          instanceId,
          measure: { target: "object", key: catalogId },
          ctx,
          seam: "object",
        }),
        markerRoot,
        state,
      );
      return;
    }
    if (kind === "modelScaled" && snap.model !== undefined) {
      const inner = new THREE.Group();
      inner.scale.set(snap.scale[0], snap.scale[1], snap.scale[2]);
      scaledGroup = inner;
      markerRoot.add(inner);
      child = mountChildDraw(isolatedEntityModelDraw({ model: snap.model, instanceId, ctx }), inner, state);
      return;
    }
    if (kind === "custom" || kind === "hidden") return;

    const material = defaultSurfaceMaterial({ color: snap.color, transparent: snap.opacity < 1, opacity: snap.opacity });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.position.y = 0.5 * snap.scale[1];
    mesh.scale.set(snap.scale[0], snap.scale[1], snap.scale[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    visual = trackedVisual(markerRoot, mesh);
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(markerRoot);
      syncVisual(state);
    },
    update(state: EngineFrameState) {
      syncVisual(state);
    },
    frame() {
      const live = ctx.scene.object.get(instanceId);
      // Removed: the object list does not re-render for a removal, so the marker hides itself.
      if (live === null) {
        markerRoot.visible = false;
        return;
      }
      writePoseIfChanged(markerRoot, live, memo);
      markerRoot.visible = visible.current(instanceId);
      setCulled(markerRoot, !markerRoot.visible);
    },
    dispose(state: EngineFrameState) {
      teardownVisual();
      state.scene.remove(markerRoot);
    },
  };
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
  const ctx = useGameContext();
  const visibleRef = useRenderVisibility();
  const markerRoot = useMemo(() => new THREE.Group(), []);
  const [scaleX, scaleY, scaleZ] = objectVisualScale(object.visual);
  const latest = useRef<ObjectMarkerSnapshot>({
    hasCustom: false,
    model: undefined,
    hidden: false,
    drawsScaled: false,
    scale: [1, 1, 1],
    color: "#9ca3af",
    opacity: 1,
  });
  latest.current = {
    hasCustom: custom !== undefined && custom !== null,
    model,
    hidden: style?.hidden === true,
    drawsScaled: drawsScaledModel(object),
    scale: [scaleX, scaleY, scaleZ],
    color: object.visual?.color ?? style?.color ?? colorFromId(object.catalogId),
    opacity: object.visual?.opacity ?? style?.opacity ?? 1,
  };
  useEngineDraw(
    () =>
      objectMarkerDraw({
        instanceId: object.instanceId,
        catalogId: object.catalogId,
        ctx,
        visible: visibleRef,
        latest,
        markerRoot,
      }),
    [object.instanceId, object.catalogId, ctx, visibleRef, latest, markerRoot],
  );
  return (
    <SceneObjectPortal object={markerRoot}>
      {custom !== undefined && custom !== null ? (
        <MeasuredBoundsGroup target="object" measureKey={object.catalogId}>
          {custom}
        </MeasuredBoundsGroup>
      ) : null}
    </SceneObjectPortal>
  );
});

function groundPlaneDraw(): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  let normalMap: THREE.Texture | null = null;
  return {
    mount(state: EngineFrameState) {
      geometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS);
      const positions = geometry.getAttribute("position");
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
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      normalMap = detailMaps().normal.clone();
      normalMap.repeat.set(48, 48);
      normalMap.needsUpdate = true;
      material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
        normalMap,
        normalScale: new THREE.Vector2(0.8, 0.8),
        envMapIntensity: 0.4,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) state.scene.remove(mesh);
      geometry?.dispose();
      material?.dispose();
      normalMap?.dispose();
      mesh = null;
      geometry = null;
      material = null;
      normalMap = null;
    },
  };
}

function GroundPlane() {
  useEngineDraw(() => groundPlaneDraw(), []);
  return null;
}

const ROCK_COUNT = 18;

function rockFieldDraw(): EngineDraw {
  const root = new THREE.Group();
  const geometry = new THREE.DodecahedronGeometry(0.8, 1);
  const material = defaultSurfaceMaterial({ color: "#6b6f63", roughness: 0.95 });
  for (let index = 0; index < ROCK_COUNT; index += 1) {
    const angle = index * 2.399963229728653;
    const radius = 10 + ((index * 17) % 58);
    const scale = 0.45 + ((index * 13) % 11) / 10;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(Math.cos(angle) * radius, 0.25 * scale, Math.sin(angle) * radius);
    mesh.rotation.set(0.1, angle, -0.08);
    mesh.scale.set(scale * 1.4, scale * 0.7, scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(root);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(root);
      geometry.dispose();
      material.dispose();
    },
  };
}

function RockField() {
  useEngineDraw(() => rockFieldDraw(), []);
  return null;
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
  // The shell dispatches the hit entity id from the canvas pointer-down.
  useEffect(() => {
    registerWorldEntityPointerDown((entityId) => {
      if (entityId === controlledId) return;
      const live = ctx.scene.entity.get(entityId);
      if (live !== null) handleSelect(live);
    });
    return () => registerWorldEntityPointerDown(null);
  }, [controlledId, ctx, handleSelect]);
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
  const host = useEngineHost();
  const scene = host.frame.scene;
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

let worldEntityPointerDown: ((entityId: string) => void) | null = null;

/** WorldEntities registers its entity-select handler here; the shell dispatches canvas pointer-down hits. @internal */
export function registerWorldEntityPointerDown(handler: ((entityId: string) => void) | null): void {
  worldEntityPointerDown = handler;
}

/** Dispatch a canvas pointer-down that hit `entityId` to the world select handler, if one is mounted. @internal */
export function dispatchWorldEntityPointerDown(entityId: string): void {
  worldEntityPointerDown?.(entityId);
}

const PLAYER_BODY_GEO = { capsule: [0.35, 1.1, 6, 14] as const, box: [0.16, 0.16, 0.16] as const };

function remotePlayersDraw(getRows: () => readonly PresencePoseRow[], getDelay: () => number): EngineDraw {
  const root = new THREE.Group();
  const capsuleGeometry = new THREE.CapsuleGeometry(...PLAYER_BODY_GEO.capsule);
  const boxGeometry = new THREE.BoxGeometry(...PLAYER_BODY_GEO.box);
  const headMaterial = new THREE.MeshStandardMaterial({ color: "#f8fafc" });
  interface RowEntry {
    group: THREE.Group;
    buffer: SnapshotBuffer<PresencePoseRow>;
    bodyMaterial: THREE.MeshStandardMaterial;
  }
  const entries = new Map<string, RowEntry>();
  let lastRows: readonly PresencePoseRow[] | null = null;
  let lastDelay = -1;

  const reconcile = () => {
    const rows = getRows();
    const delay = getDelay();
    if (rows === lastRows && delay === lastDelay) return;
    lastRows = rows;
    lastDelay = delay;
    const active = new Set(rows.map((row) => row.userId));
    for (const row of rows) {
      let entry = entries.get(row.userId);
      if (entry === undefined) {
        const group = new THREE.Group();
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: colorFromId(row.userId) });
        const body = new THREE.Mesh(capsuleGeometry, bodyMaterial);
        body.position.y = 0.95;
        const head = new THREE.Mesh(boxGeometry, headMaterial);
        head.position.set(0, 1.35, 0.32);
        group.add(body, head);
        root.add(group);
        entry = { group, buffer: createSnapshotBuffer({ delayMs: delay, capacity: 16 }), bodyMaterial };
        entries.set(row.userId, entry);
      } else {
        entry.buffer.retune({ delayMs: delay });
      }
      entry.buffer.push(row.lastSeenAt, row);
    }
    for (const [userId, entry] of entries) {
      if (active.has(userId)) continue;
      root.remove(entry.group);
      entry.bodyMaterial.dispose();
      entries.delete(userId);
    }
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(root);
      reconcile();
    },
    update: reconcile,
    frame(state: EngineFrameState) {
      const now = state.clock.getElapsedTime() * 1000;
      for (const entry of entries.values()) {
        const sample = entry.buffer.sampleAt(now);
        if (sample === null) continue;
        const before = sample.before;
        const after = sample.after;
        entry.group.position.set(
          before.position.x + (after.position.x - before.position.x) * sample.alpha,
          before.position.y + (after.position.y - before.position.y) * sample.alpha,
          before.position.z + (after.position.z - before.position.z) * sample.alpha,
        );
        entry.group.rotation.y = before.rotationY + (after.rotationY - before.rotationY) * sample.alpha;
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(root);
      for (const entry of entries.values()) entry.bodyMaterial.dispose();
      entries.clear();
      capsuleGeometry.dispose();
      boxGeometry.dispose();
      headMaterial.dispose();
    },
  };
}

export function RemotePlayers({ rows, presenceInterpolationMs = 100 }: { rows: PresencePoseRow[]; presenceInterpolationMs?: number }) {
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const delayRef = useRef(presenceInterpolationMs);
  delayRef.current = presenceInterpolationMs;
  useEngineDraw(() => remotePlayersDraw(() => rowsRef.current, () => delayRef.current), []);
  return null;
}
