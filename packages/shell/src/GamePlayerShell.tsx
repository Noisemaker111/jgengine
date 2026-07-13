import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentType,
  type ErrorInfo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import {
  actionRepeatMs,
  createActionStateTracker,
  hotbarSlotActionIndex,
  resolveActionCommand,
  shouldDispatchAction,
  toActionStateBindingMap,
  type ActionStateTracker,
} from "@jgengine/core/input/actionBindings";
import { deriveTouchScheme, withTouchCodes, DEFAULT_TOUCH_STYLE } from "@jgengine/core/input/touchScheme";
import {
  buildContextMenu,
  contextVerbInput,
  type ContextMenu,
  type ContextVerb,
} from "@jgengine/core/interaction/contextMenu";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import { aimToPoint } from "@jgengine/core/input/pointer";
import { eyeHeightFromColliders } from "@jgengine/core/combat/shotOrigin";
import { normalizePointerToAxis, type PointerAxisState } from "@jgengine/core/input/pointerAxis";
import type { Aim } from "@jgengine/core/scene/spatial";
import {
  createSelectionSet,
  isMarquee,
  screenRect,
  selectWithinRect,
  type ScreenRect,
} from "@jgengine/core/scene/selection";
import { steerYaw } from "@jgengine/core/movement/steering";
import { stepPlayerMovement, resolvePlayerMovementTuning } from "@jgengine/core/movement/playerMovement";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { isServerAuthoritative } from "@jgengine/core/runtime/adapter";
import { attachWorldSync } from "./worldSync";
import { localCommandSink, resolveCommandSink, type CommandSink } from "./commandSink";
import { inputFramesEqual, resolveInputSink, type InputSink } from "./inputSink";
import type { InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import type { SkyEnvironmentDescriptor, WorldFeature } from "@jgengine/core/world/features";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { objectVisualScale, type SceneObject } from "@jgengine/core/scene/objectStore";
import { DEFAULT_PICKUP_RADIUS, WORLD_ITEM_ENTITY_NAME } from "@jgengine/core/game/worldItem";
import { useGameContext } from "@jgengine/react/provider";
import { useDisplayProfile } from "@jgengine/react/display";
import { HudViewportProvider } from "@jgengine/react/hudViewport";
import { GameViewportProvider } from "@jgengine/react/gameViewport";
import { RotateDeviceScreen } from "@jgengine/react/rotateDevice";
import { useSceneEntityIds, useSceneObjectIds, useGameStore, usePlayer, useTarget } from "@jgengine/react/hooks";
import { GameProvider } from "@jgengine/react/provider";
import type { PresencePoseRow } from "@jgengine/core/runtime/transport";

import type {
  BackdropConfig,
  DirectionalLightingConfig,
  EntitySpriteConfig,
  LightingConfig,
  ModelConfig,
  ObjectStyle,
  PointerConfig,
} from "@jgengine/core/game/playableGame";
import { CAMERA_FRUSTUM_DEFAULTS } from "@jgengine/core/game/playableGame";
import type { GameSettingsConfig } from "@jgengine/core/settings/settingsModel";
import { createSettingsStore } from "@jgengine/core/settings/settingsModel";
import {
  applyBindingOverrides,
  clearBindingOverride,
  loadBindingOverrides,
  saveBindingOverride,
  type BindingOverrides,
} from "@jgengine/core/input/bindingOverrides";
import { playControlsActive } from "@jgengine/core/game/controlGate";
import {
  orientationGateActive,
  orientationHintActive,
  resolveOrientationRequirement,
  type LayoutOrientation,
} from "@jgengine/core/ui/orientation";
import { resolveOneShotClip } from "@jgengine/core/game/modelAnimation";
import { sky as resolveSkyDescriptor } from "@jgengine/core/world/features";

import { devtools } from "@jgengine/core/devtools/devtools";
import { VERSION } from "@jgengine/core/meta/changelog";

import { AudioListener, EntityAudioEmitters, ObjectAudioEmitters } from "./audio/AudioComponents";
import { createAudioEngine } from "./audio/audioEngine";
import { PostProcessing } from "./postfx/PostProcessing";
import { CollisionDebugWorld } from "./devtools/CollisionDebugWorld";
import { collisionDebug } from "./devtools/collisionDebug";
import { DevtoolsOverlay, DevtoolsRendererProbe, withDevtoolsLatency } from "./devtools/DevtoolsOverlay";
import {
  GAME_SIM_FRAME_PRIORITY,
  GameCameraRig,
  PlayerFovProvider,
  PlayerFovSlider,
  resolveRigKind,
  rtsPanKeysConflict,
} from "./camera";
import { resolveModel, tryResolveCatalogModel } from "./render/resolveModel";
import { CullingProvider, useRenderVisibility } from "./visibility/CullingProvider";
import { SkyDaylight, TimeOfDayDaylight } from "./environment";
import { resolveSkyLightOwnership, skyEmitsLights } from "./environment/skyLightingPolicy";
import { EnvironmentScene } from "./environment/EnvironmentScene";
import { applyMaterialOverride } from "./materialOverride";
import { PointerProbe } from "./pointer/PointerProbe";
import {
  applyPaintTextureToMaterials,
  cacheStandardMaterials,
  cloneModelScene,
  createPaintCanvas,
  disposeClonedMaterials,
  syncPaintCanvas,
  type MaterialCache,
  type PaintCanvas,
} from "./render/modelRender";
import { writeEntityPose } from "./world/entityPose";
import { MarqueeBox, ContextMenuView } from "./pointer/PointerOverlays";
import {
  createPointerService,
  POINTER_ENTITY_KEY,
  POINTER_OBJECT_KEY,
  type PointerService,
} from "./pointer/pointerService";
import {
  CombatCameraShake,
  ProjectileTracers,
  Reticle,
  WorldEntityBars,
  WorldFloatText,
  WorldTelegraphs,
} from "./world/WorldHud";
import { GridWorldScene } from "./world/GridWorldScene";
import { WorldItems } from "./world/WorldItems";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";
import { OrientationHint } from "./touch/OrientationHint";
import { TouchControlsDock, TouchPlaySurface, touchDockClearance } from "./touch/TouchControlsOverlay";
import { BUILT_IN_SETTING_CATEGORIES } from "@jgengine/core/settings/settingsModel";
import { SettingsProvider, type SettingsActionView } from "@jgengine/react/settings";
import { SettingsRuntime } from "./settings/SettingsRuntime";
import { SettingsChrome } from "./settings/SettingsChrome";
import { AudioSettingsBridge, useGraphicsSettings, useTouchStyle } from "./settings/appliedSettings";

const DEV_USER_ID = "dev-player";
const TURN_SPEED = 2.4;
const PRIMARY_CLICK_MOVE_THRESHOLD_PX = 6;
const GROUND_SIZE = 160;
const GROUND_SEGMENTS = 80;
const DEFAULT_BACKGROUND_COLOR = "#14161b";
const DEFAULT_BACKDROP_FOG_COLOR = "#1a1c22";

interface RuntimeDiagnostic {
  id: number;
  phase: string;
  message: string;
  stack?: string;
  componentStack?: string;
  capturedAt: string;
}

function errorToDiagnostic(error: unknown, phase: string, componentStack?: string): Omit<RuntimeDiagnostic, "id"> {
  const capturedAt = new Date().toISOString();
  if (error instanceof Error) {
    return { phase, message: error.message, stack: error.stack, componentStack, capturedAt };
  }
  return { phase, message: typeof error === "string" ? error : JSON.stringify(error), componentStack, capturedAt };
}

function logRuntimeError(error: unknown, phase: string, componentStack?: string): Omit<RuntimeDiagnostic, "id"> {
  const diagnostic = errorToDiagnostic(error, phase, componentStack);
  console.error(`[jgengine:${phase}] ${diagnostic.message}`, error);
  return diagnostic;
}

const RESERVED_INPUT_ACTIONS: ReadonlySet<string> = new Set([
  "moveForward",
  "moveBack",
  "moveLeft",
  "moveRight",
  "turnLeft",
  "turnRight",
  "sprint",
  "jump",
  "tabTarget",
  "clearTarget",
  "useAbility",
  "interact",
]);

/** No action names are reserved when no camera rig is active (hud/none presentation): games may bind `turnLeft`/`interact`/etc. as their own. */
const EMPTY_RESERVED: ReadonlySet<string> = new Set();

/** Empty action list — published while the orientation gate is up to suppress all held input without touching the tracker. */
const NO_ACTIONS: string[] = [];

const SHELL_MOVEMENT_ACTIONS = ["moveForward", "moveBack", "moveLeft", "moveRight", "jump"] as const;

function shellDrivesPlayerPose(input: PlayableGame["game"]["input"]): boolean {
  const bound = input ?? {};
  return SHELL_MOVEMENT_ACTIONS.some((action) => action in bound);
}

function findHotbarSlotActions(input: PlayableGame["game"]["input"]): { action: string; slot: number }[] {
  return Object.keys(input ?? {}).flatMap((action) => {
    const slot = hotbarSlotActionIndex(action);
    return slot === null ? [] : [{ action, slot }];
  });
}

function hotbarIdFor(playable: PlayableGame): string | null {
  const declarations = Object.entries(playable.game.inventories ?? {});
  const hud = declarations.find(([, declaration]) => declaration.hud === "hotbar");
  return (hud ?? declarations[0])?.[0] ?? null;
}

function executeHotbarSlot(
  ctx: GameContext,
  fromId: string,
  hotbarId: string,
  slot: number,
  yaw: number,
  pitch: number,
  aimOverride?: Aim,
): { ok: boolean; error?: string } {
  const stack = ctx.player.inventory.state(hotbarId).slots[slot];
  if (stack === undefined || stack === null) return { ok: false, error: `Hotbar slot ${slot + 1} is empty` };
  const result = ctx.item.use.use({
    from: fromId,
    itemId: stack.itemId,
    inventoryId: hotbarId,
    aim: aimOverride ?? { yaw, pitch },
  });
  return result.error === undefined ? { ok: true } : { ok: false, error: result.error };
}

function pointerAimFor(ctx: GameContext, service: PointerService): Aim | undefined {
  const hit = service.worldHit();
  if (hit === null) return undefined;
  const shooter =
    ctx.scene.entity.get(ctx.player.possession.active(ctx.player.userId)) ??
    ctx.scene.entity.get(ctx.player.userId);
  if (shooter === null) return undefined;
  const eye = eyeHeightFromColliders(ctx.scene.entity.collidersOf(shooter.id));
  return aimToPoint(
    [shooter.position[0], shooter.position[1] + eye, shooter.position[2]],
    hit.point,
  );
}

function pointerContextMenu(ctx: GameContext, playable: PlayableGame, hit: { point: readonly [number, number, number]; entity: string | null; object: string | null }): ContextMenu | null {
  if (hit.entity !== null) {
    const entity = ctx.scene.entity.get(hit.entity);
    const verbs = entity === null ? undefined : playable.content.entityById?.(entity.name)?.verbs;
    return buildContextMenu({ kind: "entity", targetId: hit.entity, verbs, point: hit.point });
  }
  if (hit.object !== null) {
    const verbs = ctx.scene.object.catalog(hit.object)?.verbs;
    return buildContextMenu({ kind: "object", targetId: hit.object, verbs, point: hit.point });
  }
  return null;
}

/** Actions from `input` currently held down, for `ctx.input.publish` (#164.1); includes reserved movement/jump actions. */
export function heldActionsFor(tracker: Pick<ActionStateTracker<string>, "isDown">, actions: readonly string[]): string[] {
  return actions.filter((action) => tracker.isDown(action));
}

/** Whether a bound action should fire this frame: on press, or on repeat interval while held (shared by `FrameDriver` and `HudOnlyDriver`). */
export function shouldFireBoundAction(
  tracker: Pick<ActionStateTracker<string>, "isDown" | "wasPressed">,
  action: string,
  input: PlayableGame["game"]["input"],
  repeatFiredAt: ReadonlyMap<string, number>,
  now: number,
): boolean {
  return shouldDispatchAction({
    pressed: tracker.wasPressed(action),
    down: tracker.isDown(action),
    repeatMs: actionRepeatMs(input?.[action]),
    lastFiredAt: repeatFiredAt.get(action) ?? null,
    now,
  });
}

/** Resolves and runs the command bound to `action` via the shell's action→command convention (shared by `FrameDriver` and `HudOnlyDriver`). */
export function dispatchBoundAction(
  ctx: GameContext,
  action: string,
  yaw: number,
  pitch: number,
  aim: Aim,
  reserved: ReadonlySet<string> = RESERVED_INPUT_ACTIONS,
  sink: CommandSink = localCommandSink(ctx),
): void {
  const command = resolveActionCommand(action, (name) => ctx.game.commands.has(name), reserved);
  if (command !== null) sink.run(command, { yaw, pitch, aim });
}

export { applyMotionImpulses } from "@jgengine/core/runtime/motionIntents";
export { nearbyObstacles } from "@jgengine/core/movement/movementModel";
export { resolvePhysicsTuning } from "@jgengine/core/movement/playerMovement";
export { hasEnvironmentTerrain } from "@jgengine/core/world/terrain";

/** The world's declared sky, when its world feature is an environment with one (#196.1). */
export function resolveWorldSky(world: WorldFeature | undefined): SkyEnvironmentDescriptor | undefined {
  return world?.kind === "environment" ? world.sky : undefined;
}

function colorFromId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return `hsl(${hash % 360}, 65%, 55%)`;
}

function DirectionalShadowLight({ entry }: { entry: DirectionalLightingConfig }) {
  const size = entry.shadowCameraSize ?? 40;
  return (
    <directionalLight
      position={[entry.position[0], entry.position[1], entry.position[2]]}
      intensity={entry.intensity ?? 1.3}
      color={entry.color}
      castShadow={entry.castShadow ?? false}
      shadow-mapSize-width={entry.shadowMapSize ?? 1024}
      shadow-mapSize-height={entry.shadowMapSize ?? 1024}
      shadow-camera-left={-size}
      shadow-camera-right={size}
      shadow-camera-top={size}
      shadow-camera-bottom={-size}
      shadow-camera-near={0.5}
      shadow-camera-far={Math.max(200, size * 6)}
      shadow-bias={entry.shadowBias ?? -0.0004}
      shadow-normalBias={entry.shadowNormalBias ?? 0.02}
    />
  );
}

function ConfiguredLighting({ lighting }: { lighting: LightingConfig }) {
  return (
    <>
      {lighting.ambient !== undefined ? (
        <ambientLight color={lighting.ambient.color} intensity={lighting.ambient.intensity ?? 0.55} />
      ) : null}
      {lighting.hemisphere !== undefined ? (
        <hemisphereLight
          args={[
            lighting.hemisphere.skyColor ?? "#bfe3ff",
            lighting.hemisphere.groundColor ?? "#4c6b34",
            lighting.hemisphere.intensity ?? 0.55,
          ]}
        />
      ) : null}
      {(lighting.directional ?? []).map((entry, index) => (
        <DirectionalShadowLight key={index} entry={entry} />
      ))}
    </>
  );
}

function BackdropFog({ fog }: { fog: BackdropConfig["fog"] }) {
  if (fog === undefined) return null;
  return fog.density !== undefined ? (
    <fogExp2 attach="fog" args={[fog.color ?? DEFAULT_BACKDROP_FOG_COLOR, fog.density]} />
  ) : (
    <fog attach="fog" args={[fog.color ?? DEFAULT_BACKDROP_FOG_COLOR, fog.near ?? 10, fog.far ?? 200]} />
  );
}

function EntitySprite({ sprite }: { sprite: EntitySpriteConfig }) {
  const texture = useLoader(THREE.TextureLoader, sprite.url);
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <sprite position-y={sprite.y} scale={[sprite.width, sprite.height, 1]}>
      <spriteMaterial map={texture} transparent alphaTest={0.08} depthWrite={false} />
    </sprite>
  );
}

class ModelFallbackBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function IsolatedEntityModel({
  model,
  instanceId,
  fallback,
}: {
  model: ModelConfig;
  instanceId?: string;
  fallback?: ReactNode;
}) {
  return (
    <ModelFallbackBoundary fallback={fallback ?? null}>
      <Suspense fallback={null}>
        <EntityModel model={model} instanceId={instanceId} />
      </Suspense>
    </ModelFallbackBoundary>
  );
}

function BoneAttachment({
  rig,
  model,
  slot,
  position,
  rotation,
  scale,
}: {
  rig: THREE.Object3D;
  model: ModelConfig;
  slot: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  const gltf = useLoader(GLTFLoader, model.url, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const weaponScene = useMemo(() => cloneModelScene(gltf.scene), [gltf]);
  const px = position?.[0] ?? 0;
  const py = position?.[1] ?? 0;
  const pz = position?.[2] ?? 0;
  const rx = rotation?.[0] ?? 0;
  const ry = rotation?.[1] ?? 0;
  const rz = rotation?.[2] ?? 0;
  const s = scale ?? 1;

  useEffect(() => {
    const bone = rig.getObjectByName(slot);
    if (bone === undefined) {
      if (typeof console !== "undefined") {
        console.warn(`[jgengine] entityModels attachment: bone/slot "${slot}" not found on the rig`);
      }
      return;
    }
    weaponScene.position.set(px, py, pz);
    weaponScene.rotation.set(rx, ry, rz);
    weaponScene.scale.setScalar(s);
    bone.add(weaponScene);
    return () => {
      bone.remove(weaponScene);
    };
  }, [rig, weaponScene, slot, px, py, pz, rx, ry, rz, s]);

  useEffect(() => () => disposeClonedMaterials(weaponScene), [weaponScene]);

  return null;
}

/** Resolves an entity model plus any bone attachments' models through the asset catalog, so `EntityModel` receives fully-resolved `ModelConfig`s. */
function resolveEntityModel(
  value: string | ModelConfig | undefined,
  assets: AssetCatalog,
  key: string,
): ModelConfig | undefined {
  const model = resolveModel(value, assets, { seam: "entityModels", key });
  if (model?.attachments === undefined) return model;
  return {
    ...model,
    attachments: model.attachments.map((attachment) => ({
      ...attachment,
      model: resolveModel(attachment.model, assets) ?? attachment.model,
    })),
  };
}

function EntityModel({ model, instanceId }: { model: ModelConfig; instanceId?: string }) {
  const gltf = useLoader(GLTFLoader, model.url, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const ctx = useGameContext();
  const material = model.material;
  const baseY = model.y ?? 0;
  const dims = model.dims;

  const scene = useMemo(() => {
    const cloned = cloneModelScene(gltf.scene);
    if (material !== undefined) applyMaterialOverride(cloned, material, { clone: false });
    return cloned;
  }, [gltf, material]);

  const measured = useMemo(() => {
    if (model.targetHeight === undefined) return null;
    const box = new THREE.Box3().setFromObject(scene);
    const height = box.max.y - box.min.y;
    if (!Number.isFinite(height) || height <= 0) return null;
    return {
      normalize: model.targetHeight / height,
      minY: box.min.y,
      centerX: (box.min.x + box.max.x) / 2,
      centerZ: (box.min.z + box.max.z) / 2,
    };
  }, [scene, model.targetHeight]);

  const scale = (model.scale ?? 1) * (measured?.normalize ?? 1);
  const centered = (model.anchor ?? "center") === "center" && dims !== undefined;
  const position: [number, number, number] =
    measured !== null
      ? [-scale * measured.centerX, baseY - scale * measured.minY, -scale * measured.centerZ]
      : centered
        ? [-scale * dims!.center.x, baseY - scale * dims!.minY, -scale * dims!.center.z]
        : [0, baseY, 0];

  useEffect(
    () => () => {
      disposeClonedMaterials(scene);
    },
    [scene],
  );

  const animation = model.animation;
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationPausedRef = useRef(false);
  const stateActionsRef = useRef<{
    actions: Partial<Record<"idle" | "walk" | "run", THREE.AnimationAction>>;
    active: "idle" | "walk" | "run";
    lastPos: [number, number, number] | null;
    smoothedSpeed: number;
  } | null>(null);
  const states = animation?.states;
  const oneShots = animation?.oneShots;
  const oneShotPlayRef = useRef<((event: string) => void) | null>(null);
  const activeOneShotRef = useRef<{ action: THREE.AnimationAction; isDeath: boolean } | null>(null);

  useEffect(() => {
    if (animation === undefined || gltf.animations.length === 0) {
      mixerRef.current = null;
      stateActionsRef.current = null;
      return;
    }
    const mixer = new THREE.AnimationMixer(scene);
    if (states !== undefined) {
      const clipFor = (name: string) =>
        THREE.AnimationClip.findByName(gltf.animations, name) ?? gltf.animations[0]!;
      const actions: Partial<Record<"idle" | "walk" | "run", THREE.AnimationAction>> = {
        idle: mixer.clipAction(clipFor(states.idle)),
        walk: mixer.clipAction(clipFor(states.walk)),
        ...(states.run === undefined ? {} : { run: mixer.clipAction(clipFor(states.run)) }),
      };
      for (const action of Object.values(actions)) {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.timeScale = animation.timeScale ?? 1;
        action.enabled = true;
      }
      actions.idle!.play();
      mixer.update(0);
      mixerRef.current = mixer;
      stateActionsRef.current = { actions, active: "idle", lastPos: null, smoothedSpeed: 0 };
      animationPausedRef.current = false;

      let onOneShotFinished: ((event: { action: THREE.AnimationAction }) => void) | null = null;
      if (oneShots !== undefined) {
        const clipNames = new Set<string>();
        for (const spec of Object.values(oneShots)) {
          if (typeof spec === "string") clipNames.add(spec);
          else for (const name of spec) clipNames.add(name);
        }
        const oneShotActions = new Map<string, THREE.AnimationAction>();
        for (const name of clipNames) {
          const found = THREE.AnimationClip.findByName(gltf.animations, name);
          if (found === null) continue;
          const oneShotAction = mixer.clipAction(found);
          oneShotAction.setLoop(THREE.LoopOnce, 1);
          oneShotAction.enabled = true;
          oneShotActions.set(name, oneShotAction);
        }
        onOneShotFinished = ({ action }) => {
          const active = activeOneShotRef.current;
          if (active === null || action !== active.action || active.isDeath) return;
          const machine = stateActionsRef.current;
          const back = machine?.actions[machine.active];
          action.fadeOut(0.15);
          if (back !== undefined) back.reset().fadeIn(0.15).play();
          activeOneShotRef.current = null;
        };
        mixer.addEventListener("finished", onOneShotFinished);
        oneShotPlayRef.current = (event: string) => {
          const active = activeOneShotRef.current;
          if (active !== null && active.isDeath) return;
          const clipName = resolveOneShotClip(oneShots, event, Math.random());
          if (clipName === null) return;
          const oneShotAction = oneShotActions.get(clipName);
          if (oneShotAction === undefined) return;
          const machine = stateActionsRef.current;
          machine?.actions[machine.active]?.fadeOut(0.1);
          if (active !== null && active.action !== oneShotAction) active.action.stop();
          oneShotAction.clampWhenFinished = event === "death";
          oneShotAction.reset().fadeIn(0.1).play();
          activeOneShotRef.current = { action: oneShotAction, isDeath: event === "death" };
        };
      }

      return () => {
        if (onOneShotFinished !== null) mixer.removeEventListener("finished", onOneShotFinished);
        oneShotPlayRef.current = null;
        activeOneShotRef.current = null;
        mixer.stopAllAction();
        mixerRef.current = null;
        stateActionsRef.current = null;
      };
    }
    const clip =
      (animation.clip !== undefined ? THREE.AnimationClip.findByName(gltf.animations, animation.clip) : undefined) ??
      gltf.animations[0]!;
    const action = mixer.clipAction(clip);
    action.setLoop(animation.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = animation.loop === false;
    action.timeScale = animation.timeScale ?? 1;
    action.enabled = true;
    action.paused = animation.paused === true;
    action.play();
    if (animation.time !== undefined) action.time = animation.time;
    mixer.update(0);
    mixerRef.current = mixer;
    animationPausedRef.current = animation.paused === true;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [
    scene,
    gltf,
    animation?.clip,
    animation?.loop,
    animation?.timeScale,
    animation?.paused,
    animation?.time,
    states,
    oneShots,
  ]);

  useEffect(() => {
    if (instanceId === undefined || oneShots === undefined) return;
    const fire = (event: string) => oneShotPlayRef.current?.(event);
    const offAnimation = ctx.game.events.on("entity.animation", (event) => {
      if (event.instanceId === instanceId) fire(event.event);
    });
    const offHit = ctx.game.events.on("combat.hitReaction", (event) => {
      if (event.instanceId === instanceId) fire("hit");
    });
    const offDied = ctx.game.events.on("entity.died", (event) => {
      if (event.instanceId === instanceId) fire("death");
    });
    return () => {
      offAnimation();
      offHit();
      offDied();
    };
  }, [ctx, instanceId, oneShots]);

  const paintCanvasRef = useRef<PaintCanvas | null>(null);
  const paintDrawnCountRef = useRef(0);
  const paintVersionRef = useRef(-1);
  const materialCacheRef = useRef<MaterialCache | null>(null);

  useEffect(() => {
    paintCanvasRef.current = null;
    paintDrawnCountRef.current = 0;
    paintVersionRef.current = -1;
    materialCacheRef.current = null;
  }, [scene]);

  useFrame((_state, delta) => {
    const stateMachine = stateActionsRef.current;
    if (stateMachine !== null && states !== undefined && instanceId !== undefined && delta > 0) {
      const entity = ctx.scene.entity.get(instanceId);
      if (entity !== null) {
        const [x, , z] = entity.position;
        if (stateMachine.lastPos !== null) {
          const instantSpeed =
            Math.hypot(x - stateMachine.lastPos[0], z - stateMachine.lastPos[2]) / delta;
          stateMachine.smoothedSpeed +=
            (instantSpeed - stateMachine.smoothedSpeed) * Math.min(1, delta * 12);
        }
        stateMachine.lastPos = [x, entity.position[1], z];
        const walkSpeed = states.walkSpeed ?? 0.5;
        const runSpeed = states.runSpeed ?? 6;
        const next: "idle" | "walk" | "run" =
          stateMachine.smoothedSpeed < walkSpeed
            ? "idle"
            : stateMachine.actions.run !== undefined && stateMachine.smoothedSpeed >= runSpeed
              ? "run"
              : "walk";
        if (next !== stateMachine.active) {
          if (activeOneShotRef.current === null) {
            const fade = states.fadeSec ?? 0.2;
            const from = stateMachine.actions[stateMachine.active];
            const to = stateMachine.actions[next];
            if (from !== undefined && to !== undefined) {
              to.reset().fadeIn(fade).play();
              from.fadeOut(fade);
            }
          }
          stateMachine.active = next;
        }
      }
    }
    if (mixerRef.current !== null && !animationPausedRef.current) mixerRef.current.update(delta);
    if (instanceId === undefined) return;
    const paint = ctx.scene.entity.paint;
    const version = paint.version(instanceId);
    if (version === paintVersionRef.current) return;
    paintVersionRef.current = version;
    const strokes = paint.strokes(instanceId);
    const cache = cacheStandardMaterials(scene, materialCacheRef.current);
    materialCacheRef.current = cache;
    if (paintCanvasRef.current === null) {
      if (strokes.length === 0) return;
      const seed = cache.materials[0];
      if (seed === undefined) return;
      const paintCanvas = createPaintCanvas(seed);
      paintCanvasRef.current = paintCanvas;
      applyPaintTextureToMaterials(cache.materials, paintCanvas);
    }
    paintDrawnCountRef.current = syncPaintCanvas(
      paintCanvasRef.current,
      cache.seedColor,
      strokes,
      paintDrawnCountRef.current,
    );
  });

  return (
    <>
      <primitive object={scene} position={position} scale={[scale, scale, scale]} />
      {(model.attachments ?? []).map((attachment, index) =>
        typeof attachment.model === "string" ? null : (
          <BoneAttachment
            key={`${attachment.slot}-${index}`}
            rig={scene}
            model={attachment.model}
            slot={attachment.slot}
            position={attachment.position}
            rotation={attachment.rotation}
            scale={attachment.scale}
          />
        ),
      )}
    </>
  );
}

function EntityMarker({
  entity,
  custom,
  model,
  sprite,
  isLocal,
  targeted,
  selected,
  onSelect,
}: {
  entity: SceneEntity;
  custom: ReactNode | undefined;
  model: ModelConfig | undefined;
  sprite: EntitySpriteConfig | undefined;
  isLocal: boolean;
  targeted: boolean;
  selected: boolean;
  onSelect: (entity: SceneEntity) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ctx = useGameContext();
  const visibleRef = useRenderVisibility();
  const entityId = entity.id;
  const role = entity.role;
  const name = entity.name;
  const color = isLocal ? "#4ade80" : role === "npc" ? colorFromId(name) : "#9ca3af";

  useFrame(() => {
    const group = groupRef.current;
    if (group === null) return;
    const live = ctx.scene.entity.get(entityId);
    if (live === null) return;
    writeEntityPose(group, live);
    group.visible = visibleRef.current(entityId);
  });

  return (
    <group
      ref={groupRef}
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
      {custom !== undefined && custom !== null ? (
        custom
      ) : model !== undefined ? (
        <IsolatedEntityModel
          model={model}
          instanceId={entityId}
          fallback={sprite !== undefined ? <EntitySprite sprite={sprite} /> : undefined}
        />
      ) : sprite !== undefined ? (
        <EntitySprite sprite={sprite} />
      ) : role === "prop" ? (
        <mesh position-y={0.5}>
          <sphereGeometry args={[0.45, 16, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ) : (
        <group scale={ctx.scene.entity.visualScaleOf(entityId)}>
          <mesh position-y={0.95}>
            <capsuleGeometry args={[0.35, 1.1, 6, 14]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 1.35, 0.32]}>
            <boxGeometry args={[0.16, 0.16, 0.16]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        </group>
      )}
      {targeted ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
          <ringGeometry args={[0.6, 0.75, 28]} />
          <meshBasicMaterial color="#f87171" />
        </mesh>
      ) : null}
    </group>
  );
}

function ObjectMarker({
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
  const [scaleX, scaleY, scaleZ] = objectVisualScale(object.visual);
  const color = object.visual?.color ?? style?.color ?? colorFromId(object.catalogId);
  const opacity = object.visual?.opacity ?? style?.opacity ?? 1;

  useFrame(() => {
    const group = groupRef.current;
    if (group === null) return;
    const live = ctx.scene.object.get(instanceId);
    if (live === null) return;
    writeEntityPose(group, live);
    group.visible = visibleRef.current(instanceId);
  });

  return (
    <group ref={groupRef} userData={{ [POINTER_OBJECT_KEY]: instanceId }}>
      {custom !== undefined && custom !== null ? (
        custom
      ) : model !== undefined ? (
        <IsolatedEntityModel model={model} instanceId={instanceId} />
      ) : style?.hidden === true ? null : (
        <mesh position-y={0.5 * scaleY} scale={[scaleX, scaleY, scaleZ]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} />
        </mesh>
      )}
    </group>
  );
}

function GroundPlane() {
  const geometry = useMemo(() => {
    const next = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS);
    const positions = next.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const height =
        Math.sin(x * 0.16) * 0.12 +
        Math.cos(y * 0.11) * 0.1 +
        Math.sin((x + y) * 0.05) * 0.16;
      positions.setZ(index, height);
    }
    next.computeVertexNormals();
    return next;
  }, []);

  return (
    <mesh rotation-x={-Math.PI / 2} geometry={geometry}>
      <meshStandardMaterial color="#283729" roughness={0.9} metalness={0} />
    </mesh>
  );
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
        >
          <dodecahedronGeometry args={[0.8, 0]} />
          <meshStandardMaterial color="#6b6f63" roughness={1} />
        </mesh>
      ))}
    </>
  );
}

function WorldEnvironment({ environment: Environment }: { environment: ComponentType | undefined }) {
  if (Environment !== undefined) return <Environment />;
  return (
    <>
      <GroundPlane />
      <gridHelper args={[160, 80, "#3a3f4a", "#2b2f38"]} position-y={0.01} />
      <RockField />
    </>
  );
}

function WorldActors({
  entitySprites,
  entityModels,
  objectModels,
  objectStyles,
  assets,
  renderEntity,
  renderObject,
  selectedIds,
  hideLocalActor,
}: {
  entitySprites: Record<string, EntitySpriteConfig> | undefined;
  entityModels: Record<string, string | ModelConfig> | undefined;
  objectModels: Record<string, string | ModelConfig> | undefined;
  objectStyles: Record<string, ObjectStyle> | undefined;
  assets: AssetCatalog;
  renderEntity: ((entity: SceneEntity) => ReactNode) | undefined;
  renderObject: ((object: SceneObject) => ReactNode) | undefined;
  selectedIds: ReadonlySet<string>;
  hideLocalActor: boolean;
}) {
  const ctx = useGameContext();
  const entityIds = useSceneEntityIds();
  const objectIds = useSceneObjectIds();
  const player = usePlayer();
  const targetId = useTarget(player.userId);
  const controlledId = useGameStore((c) => c.player.possession.active(player.userId));
  const handleSelect = (entity: SceneEntity) => {
    const relation = ctx.scene.entity.canReceive(entity.id, "damage") === null ? "hostile" : "friendly";
    ctx.scene.entity.setTarget(controlledId, relation === "hostile" || entity.role === "npc" ? entity.id : null);
  };
  return (
    <>
      {entityIds.map((entityId) => {
        const entity = ctx.scene.entity.get(entityId);
        if (entity === null || entity.name === WORLD_ITEM_ENTITY_NAME) return null;
        if (hideLocalActor && entityId === controlledId) return null;
        return (
          <EntityMarker
            key={entityId}
            entity={entity}
            custom={renderEntity?.(entity)}
            model={resolveEntityModel(entityModels?.[entity.name], assets, entity.name)}
            sprite={entitySprites?.[entity.name]}
            isLocal={entityId === controlledId}
            targeted={entityId === targetId}
            selected={selectedIds.has(entityId)}
            onSelect={handleSelect}
          />
        );
      })}
      {objectIds.map((instanceId) => {
        const object = ctx.scene.object.get(instanceId);
        if (object === null) return null;
        const model =
          resolveModel(objectModels?.[object.catalogId], assets, {
            seam: "objectModels",
            key: object.catalogId,
          }) ?? tryResolveCatalogModel(object.catalogId, assets);
        return (
          <ObjectMarker
            key={instanceId}
            object={object}
            custom={renderObject?.(object)}
            model={model}
            style={objectStyles?.[object.catalogId]}
          />
        );
      })}
    </>
  );
}

function WorldView({
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
}) {
  return (
    <>
      <WorldEnvironment environment={environment} />
      <WorldActors
        entitySprites={entitySprites}
        entityModels={entityModels}
        objectModels={objectModels}
        objectStyles={objectStyles}
        assets={assets}
        renderEntity={renderEntity}
        renderObject={renderObject}
        selectedIds={selectedIds}
        hideLocalActor={hideLocalActor}
      />
    </>
  );
}

function RemotePlayers({ rows }: { rows: PresencePoseRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <group
          key={row.userId}
          position={[row.position.x, row.position.y, row.position.z]}
          rotation-y={row.rotationY}
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

function FrameDriver({
  ctx,
  playable,
  tracker,
  yawRef,
  pitchRef,
  primaryClickRef,
  pointerAxisRef,
  gateRef,
  onRuntimeError,
  multiplayer,
  serverIdRef,
  pointerService,
  pointerAim,
  pingCommand,
  poster,
  onPosterSettled,
}: {
  ctx: GameContext;
  playable: PlayableGame;
  tracker: ActionStateTracker<string>;
  yawRef: { current: number };
  pitchRef: { current: number };
  primaryClickRef: { current: boolean };
  pointerAxisRef: { current: PointerAxisState | null };
  gateRef: { current: boolean };
  onRuntimeError: (error: unknown, phase: string) => void;
  multiplayer: ShellMultiplayer | null;
  serverIdRef: { current: string | null };
  pointerService: PointerService;
  pointerAim: boolean;
  pingCommand: string | undefined;
  poster: boolean;
  onPosterSettled: () => void;
}) {
  const posterElapsedRef = useRef(0);
  const posterDoneRef = useRef(false);
  const hasReportedTickError = useRef(false);
  const repeatFiredAtRef = useRef<Map<string, number>>(new Map());
  const slotActions = useMemo(() => findHotbarSlotActions(playable.game.input), [playable]);
  const hotbarId = useMemo(() => hotbarIdFor(playable), [playable]);
  const movementTuning = useMemo(
    () => resolvePlayerMovementTuning({
      collision: playable.collision,
      movement: playable.movement,
      physics: playable.game.physics,
      world: playable.game.world,
    }),
    [playable],
  );
  const autoPickupRadius = useMemo(() => {
    const cfg = playable.worldItem?.autoPickup;
    if (cfg === undefined || cfg === false) return null;
    const fallback = playable.worldItem?.pickupRadius ?? DEFAULT_PICKUP_RADIUS;
    return cfg === true ? fallback : cfg.radius ?? fallback;
  }, [playable]);
  const drivesPose = useMemo(() => shellDrivesPlayerPose(playable.game.input), [playable]);
  const serverAuthoritative = useMemo(
    () => isServerAuthoritative(playable.game.multiplayer) && multiplayer !== null,
    [playable, multiplayer],
  );
  const commandSink = useMemo<CommandSink>(
    () => ({
      run: (name, input) =>
        resolveCommandSink(ctx, {
          serverAuthoritative,
          backend: multiplayer?.backend ?? null,
          serverId: serverIdRef.current,
        }).run(name, input),
    }),
    [ctx, multiplayer, serverAuthoritative, serverIdRef],
  );
  const inputSink = useMemo<InputSink>(
    () => ({
      send: (frame) =>
        resolveInputSink({
          serverAuthoritative,
          backend: multiplayer?.backend ?? null,
          serverId: serverIdRef.current,
        }).send(frame),
    }),
    [multiplayer, serverAuthoritative, serverIdRef],
  );
  const lastSentInputRef = useRef<InputFrame | null>(null);
  const inputActions = useMemo(() => Object.keys(playable.game.input ?? {}), [playable]);

  useFrame((_state, rawDt) => {
    if (poster) {
      if (posterDoneRef.current) return;
      posterElapsedRef.current += Math.min(rawDt, 0.05);
      if (posterElapsedRef.current >= POSTER_SETTLE_SECONDS) {
        posterDoneRef.current = true;
        onPosterSettled();
        return;
      }
    }
    const sendInput = () => {
      if (!serverAuthoritative) return;
      const frame: InputFrame = { held: ctx.input.held(), pointer: ctx.input.pointer() };
      const last = lastSentInputRef.current;
      if (last !== null && inputFramesEqual(last, frame)) return;
      lastSentInputRef.current = frame;
      inputSink.send(frame);
    };
    if (gateRef.current || !playControlsActive(ctx)) {
      ctx.input.publish(heldActionsFor(tracker, NO_ACTIONS));
      sendInput();
      return;
    }
    const simStart = performance.now();
    try {
    let endPhase = devtools.profile.begin("time+input");
    const dt = Math.min(rawDt, 0.05);
    const gameDt = ctx.time.advance(dt);
    ctx.input.publish(heldActionsFor(tracker, inputActions));
    ctx.input.publishPointer(pointerAxisRef.current);
    sendInput();
    const turnInput = (tracker.isDown("turnRight") ? 1 : 0) - (tracker.isDown("turnLeft") ? 1 : 0);
    if (turnInput !== 0) yawRef.current = steerYaw(yawRef.current, turnInput, TURN_SPEED, dt);
    endPhase();

    const playerId = ctx.player.possession.active(ctx.player.userId);
    const player = ctx.scene.entity.get(playerId);
    if (player !== null && drivesPose && !serverAuthoritative) {
      endPhase = devtools.profile.begin("pose");
      stepPlayerMovement(
        ctx,
        ctx.player.userId,
        { held: ctx.input.held(), pointer: ctx.input.pointer() },
        rawDt,
        movementTuning,
        yawRef.current,
      );
      endPhase();
    }

    if (autoPickupRadius !== null && !serverAuthoritative) {
      endPhase = devtools.profile.begin("pickup");
      const self = ctx.scene.entity.get(playerId);
      if (self !== null) {
        const nearest = ctx.scene.worldItem.nearestInRadius(self.position, autoPickupRadius);
        if (nearest !== null) ctx.scene.worldItem.pickup(nearest, ctx.player.userId);
      }
      endPhase();
    }

    if (!serverAuthoritative) {
      devtools.profile.measure("onTick", () => {
        playable.loop.onTick(ctx, gameDt);
      });
    }

    endPhase = devtools.profile.begin("actions");
    if (tracker.wasPressed("tabTarget")) {
      if (ctx.game.commands.has("target.cycle")) ctx.game.commands.run("target.cycle", {});
      else ctx.scene.entity.cycleTarget(playerId, { filter: "hostile" });
    }
    if (tracker.wasPressed("clearTarget")) {
      if (ctx.game.commands.has("target.clear")) ctx.game.commands.run("target.clear", {});
      else ctx.scene.entity.setTarget(playerId, null);
    }
    if (pingCommand !== undefined && tracker.wasPressed("ping")) {
      const hit = pointerService.worldHit();
      if (hit !== null && ctx.game.commands.has(pingCommand)) {
        commandSink.run(pingCommand, {
          point: hit.point,
          entity: hit.entity,
          object: hit.object,
          normal: hit.normal,
        });
      }
    }
    const aimOverride = pointerAim ? pointerAimFor(ctx, pointerService) : undefined;
    const commandAim: Aim = aimOverride ?? { yaw: yawRef.current, pitch: pitchRef.current };
    if (collisionDebug.getState().layers.aimLaser) {
      const aimFrom = ctx.player.possession.active(playerId) ?? playerId;
      collisionDebug.setAimProbe({
        from: aimFrom,
        aim: commandAim,
        originPolicy: { kind: "converge" },
        maxDistance: 100,
      });
    } else if (collisionDebug.getAimProbe() !== null) {
      collisionDebug.setAimProbe(null);
    }
    const nowMs = performance.now();
    for (const action of Object.keys(playable.game.input ?? {})) {
      const pressed = tracker.wasPressed(action);
      if (action === "ping" && pingCommand !== undefined) continue;
      if (action === "interact") {
        if (!pressed) continue;
        const prompts = playable.prompts?.(ctx);
        const focus = prompts === undefined ? null : ctx.scene.entity.get(playerId);
        if (prompts !== undefined && focus !== null) {
          const active = resolveActivePrompt({ x: focus.position[0], z: focus.position[2] }, prompts);
          if (active !== null && active.prompt.invoke !== null) {
            commandSink.run(active.prompt.invoke.name, active.prompt.invoke.input);
          }
        }
        continue;
      }
      if (!shouldFireBoundAction(tracker, action, playable.game.input, repeatFiredAtRef.current, nowMs)) continue;
      repeatFiredAtRef.current.set(action, nowMs);
      dispatchBoundAction(ctx, action, yawRef.current, pitchRef.current, commandAim, RESERVED_INPUT_ACTIONS, commandSink);
    }
    if (hotbarId !== null) {
      for (const { action, slot } of slotActions) {
        if (!tracker.wasPressed(action)) continue;
        const result = executeHotbarSlot(ctx, playerId, hotbarId, slot, yawRef.current, pitchRef.current, aimOverride);
        if (!result.ok) console.warn(`[jgengine:item-use] ${result.error}`);
      }
      const usePrimary =
        tracker.wasPressed("useAbility") || (primaryClickRef.current && hotbarId !== null);
      if (usePrimary) {
        primaryClickRef.current = false;
        const slots = ctx.player.inventory.state(hotbarId).slots;
        const preferred = playable.hotbarSelection?.() ?? -1;
        const slot =
          preferred >= 0 && slots[preferred] !== null && slots[preferred] !== undefined
            ? preferred
            : slots.findIndex((stack) => stack !== null);
        if (slot >= 0) {
          const result = executeHotbarSlot(ctx, playerId, hotbarId, slot, yawRef.current, pitchRef.current, aimOverride);
          if (!result.ok) console.warn(`[jgengine:item-use] ${result.error}`);
        }
      }
    }
    tracker.endFrame();
    endPhase();

    const serverId = serverIdRef.current;
    if (multiplayer !== null && serverId !== null) {
      endPhase = devtools.profile.begin("presence");
      const focus = ctx.scene.entity.get(playerId);
      if (focus !== null) {
        multiplayer.backend.presenceSync.syncPose(serverId, {
          x: focus.position[0],
          y: focus.position[1],
          z: focus.position[2],
          rotationY: focus.rotationY,
          rotationPitch: pitchRef.current,
        });
      }
      endPhase();
    }
    } catch (error) {
      if (!hasReportedTickError.current) {
        hasReportedTickError.current = true;
        onRuntimeError(error, "tick");
      }
    }
    devtools.frame.record({ frameMs: rawDt * 1000, simMs: performance.now() - simStart });
  }, GAME_SIM_FRAME_PRIORITY);
  return null;
}

function HudOnlyDriver({
  ctx,
  playable,
  tracker,
  pointerAxisRef,
  gateRef,
  onRuntimeError,
}: {
  ctx: GameContext;
  playable: PlayableGame;
  tracker: ActionStateTracker<string>;
  pointerAxisRef: { current: PointerAxisState | null };
  gateRef: { current: boolean };
  onRuntimeError: (error: unknown, phase: string) => void;
}) {
  const hasReportedTickError = useRef(false);
  const repeatFiredAtRef = useRef<Map<string, number>>(new Map());
  const lastFrameRef = useRef<number | null>(null);
  const inputActions = useMemo(() => Object.keys(playable.game.input ?? {}), [playable]);

  useEffect(() => {
    let frameId: number;
    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      const last = lastFrameRef.current;
      lastFrameRef.current = now;
      if (last === null) return;
      if (gateRef.current || !playControlsActive(ctx)) {
        ctx.input.publish(heldActionsFor(tracker, NO_ACTIONS));
        return;
      }
      const rawDt = (now - last) / 1000;
      const simStart = performance.now();
      try {
        let endPhase = devtools.profile.begin("time+input");
        const dt = Math.min(rawDt, 0.05);
        const gameDt = ctx.time.advance(dt);
        ctx.input.publish(heldActionsFor(tracker, inputActions));
        ctx.input.publishPointer(pointerAxisRef.current);
        endPhase();
        devtools.profile.measure("onTick", () => {
          playable.loop.onTick(ctx, gameDt);
        });
        endPhase = devtools.profile.begin("actions");
        const nowMs = performance.now();
        for (const action of inputActions) {
          if (!shouldFireBoundAction(tracker, action, playable.game.input, repeatFiredAtRef.current, nowMs)) continue;
          repeatFiredAtRef.current.set(action, nowMs);
          dispatchBoundAction(ctx, action, 0, 0, { yaw: 0, pitch: 0 }, EMPTY_RESERVED);
        }
        tracker.endFrame();
        endPhase();
      } catch (error) {
        if (!hasReportedTickError.current) {
          hasReportedTickError.current = true;
          onRuntimeError(error, "tick");
        }
      }
      devtools.frame.record({ frameMs: rawDt * 1000, simMs: performance.now() - simStart });
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [ctx, playable, tracker, pointerAxisRef, gateRef, onRuntimeError, inputActions]);

  return null;
}

class GameUiErrorBoundary extends Component<
  { children: ReactNode; onRuntimeError: (error: unknown, phase: string, componentStack?: string) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onRuntimeError(error, "ui-render", info.componentStack ?? undefined);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function expandedReactError(message: string): string | null {
  return /Minified React error #185\b/.test(message)
    ? "Maximum update depth exceeded. A component is repeatedly updating state during render or after every update."
    : null;
}

function diagnosticReport(diagnostic: RuntimeDiagnostic, gameName: string): string {
  const explanation = expandedReactError(diagnostic.message);
  return [
    "JGengine runtime error",
    `Game: ${gameName}`,
    `Engine: ${VERSION}`,
    `Phase: ${diagnostic.phase}`,
    `Time: ${diagnostic.capturedAt}`,
    `Page: ${window.location.origin}${window.location.pathname}`,
    `Browser: ${navigator.userAgent}`,
    explanation === null ? null : `Explanation: ${explanation}`,
    "",
    `Message: ${diagnostic.message}`,
    diagnostic.stack === undefined ? null : `JavaScript stack:\n${diagnostic.stack}`,
    diagnostic.componentStack === undefined ? null : `React component stack:\n${diagnostic.componentStack}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function DiagnosticOverlay({ diagnostics, gameName }: { diagnostics: RuntimeDiagnostic[]; gameName: string }) {
  const [copied, setCopied] = useState(false);
  if (diagnostics.length === 0) return null;
  const latest = diagnostics[diagnostics.length - 1]!;
  const explanation = expandedReactError(latest.message);
  const report = diagnosticReport(latest, gameName);
  const issueBody = report.length > 8000 ? `${report.slice(0, 8000)}\n\n[Report truncated; use Copy error for the full report.]` : report;
  const issueUrl = `https://github.com/Noisemaker111/jgengine/issues/new?title=${encodeURIComponent(`[BUG] ${latest.phase}: ${latest.message.slice(0, 100)}`)}&body=${encodeURIComponent(issueBody)}`;
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-50 max-w-lg rounded border border-red-400/60 bg-red-950/95 p-3 text-xs text-red-50 shadow-2xl">
      <div className="mb-1 font-semibold uppercase tracking-wide text-red-200">JG engine error</div>
      <div className="font-mono text-[11px] text-red-100">
        [{latest.phase}] {latest.message}
      </div>
      {explanation !== null ? <div className="mt-2 text-red-100">{explanation}</div> : null}
      {latest.stack !== undefined ? (
        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-[10px] text-red-200/80">
          {latest.stack}
        </pre>
      ) : null}
      {latest.componentStack !== undefined ? (
        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-[10px] text-red-200/80">
          {latest.componentStack}
        </pre>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          className="rounded border border-red-300/50 bg-red-900 px-2 py-1 font-semibold hover:bg-red-800"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(report).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "Copied" : "Copy error"}
        </button>
        <a
          className="rounded border border-red-300/50 bg-red-900 px-2 py-1 font-semibold hover:bg-red-800"
          href={issueUrl}
          rel="noreferrer"
          target="_blank"
        >
          File issue
        </a>
      </div>
    </div>
  );
}

const POSTER_SETTLE_SECONDS = 1.6;

export function GamePlayerShell({
  playable,
  multiplayer: rawMultiplayer = null,
  poster = false,
  onContextReady,
}: {
  playable: PlayableGame;
  multiplayer?: ShellMultiplayer | null;
  poster?: boolean;
  /** Called once per boot after onInit/onNewPlayer with the live GameContext — a staging seam for screenshots, tests, analytics. */
  onContextReady?: (ctx: GameContext) => void;
}) {
  const multiplayer = useMemo(
    () => (rawMultiplayer === null ? null : withDevtoolsLatency(rawMultiplayer)),
    [rawMultiplayer],
  );
  const devtoolsEnabled = playable.devtools !== false && !poster;
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const [posterFrozen, setPosterFrozen] = useState(false);
  const posterSettledRef = useRef(false);
  const [ctx, setCtx] = useState<GameContext | null>(null);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostic[]>([]);
  const [remotePlayers, setRemotePlayers] = useState<PresencePoseRow[]>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const serverIdRef = useRef<string | null>(null);
  const cameraDraggingRef = useRef(false);
  const primaryClickRef = useRef(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const pointerAxisRef = useRef<PointerAxisState | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const f2HeldRef = useRef(false);
  const f2ChordedRef = useRef(false);
  const pointerService = useMemo(() => createPointerService(), []);
  const selection = useMemo(() => createSelectionSet(), [playable]);
  const [marquee, setMarquee] = useState<ScreenRect | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{ menu: ContextMenu; x: number; y: number } | null>(null);
  const settingsStore = useMemo(() => createSettingsStore(), []);
  const [bindingOverrides, setBindingOverrides] = useState<BindingOverrides>(() =>
    loadBindingOverrides(playable.game.name),
  );
  useEffect(() => {
    setBindingOverrides(loadBindingOverrides(playable.game.name));
  }, [playable]);
  const effectiveInput = useMemo(
    () => applyBindingOverrides(playable.game.input ?? {}, bindingOverrides),
    [playable, bindingOverrides],
  );
  const rebindAction = useCallback(
    (action: string, code: string) => setBindingOverrides(saveBindingOverride(playable.game.name, action, [code])),
    [playable],
  );
  const resetActionBinding = useCallback(
    (action: string) => setBindingOverrides(clearBindingOverride(playable.game.name, action)),
    [playable],
  );
  const tracker = useMemo(
    () => createActionStateTracker(toActionStateBindingMap(withTouchCodes(effectiveInput))),
    [effectiveInput],
  );
  const graphics = useGraphicsSettings(settingsStore, playable.shadows ?? true);
  const trackPointerAxis = (event: { clientX: number; clientY: number }) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    pointerAxisRef.current = normalizePointerToAxis(event.clientX, event.clientY, rect);
  };
  const deactivatePointerAxis = () => {
    const state = pointerAxisRef.current;
    if (state !== null && state.active) pointerAxisRef.current = { ...state, active: false };
  };
  const touchScheme = useMemo(
    () =>
      deriveTouchScheme(playable.game.input, {
        reserved:
          resolveRigKind(playable.camera) === "none" || playable.presentation === "hud"
            ? EMPTY_RESERVED
            : RESERVED_INPUT_ACTIONS,
        firstPerson: resolveRigKind(playable.camera) === "first",
        config: playable.touch,
      }),
    [playable],
  );
  const { coarsePointer, portrait, compact } = useDisplayProfile();
  const touchSink = useMemo(
    () => ({ onCodeDown: (code: string) => tracker.handleDown(code), onCodeUp: (code: string) => tracker.handleUp(code) }),
    [tracker],
  );
  const gateRef = useRef(false);
  const orientationPlatform = coarsePointer ? "mobile" : "desktop";
  const orientationRequirement = useMemo(
    () => resolveOrientationRequirement(playable.orientation, orientationPlatform),
    [playable, orientationPlatform],
  );
  const liveOrientation: LayoutOrientation = portrait ? "portrait" : "landscape";
  const orientationGate = !poster && coarsePointer && orientationGateActive(orientationRequirement, liveOrientation);
  const orientationHint = !poster && coarsePointer && orientationHintActive(orientationRequirement, liveOrientation);
  gateRef.current = orientationGate;
  const orientationGateEl = orientationGate ? (
    <RotateDeviceScreen
      requiredOrientation={orientationRequirement.required ?? "landscape"}
      title={orientationRequirement.required === "portrait" ? "Turn your phone upright" : "Turn your phone sideways"}
      description={`${playable.game.name} is built for ${orientationRequirement.required ?? "landscape"} play.`}
    />
  ) : orientationHint && orientationRequirement.preferred !== null ? (
    <OrientationHint wanted={orientationRequirement.preferred} />
  ) : null;
  const audioEngine = useMemo(
    () =>
      createAudioEngine({
        sounds: playable.audio?.sounds,
        buses: playable.audio?.buses,
        music: playable.audio?.music,
        musicBus: playable.audio?.musicBus,
      }),
    [playable],
  );
  useEffect(() => () => audioEngine.dispose(), [audioEngine]);
  useEffect(() => {
    if (ctx === null) return;
    const offPlay = ctx.game.events.on("audio.play", ({ sound, at }) => {
      audioEngine.playOneShot(sound, at === undefined ? undefined : { x: at[0], y: at[1], z: at[2] });
    });
    const offMusic = ctx.game.events.on("audio.music", ({ theme, transpose }) => {
      audioEngine.playMusic(theme, transpose === undefined ? undefined : { transpose });
    });
    const offResume = ctx.game.events.on("audio.resume", () => audioEngine.resume());
    return () => {
      offPlay();
      offMusic();
      offResume();
    };
  }, [ctx, audioEngine]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.jgPresentation = playable.presentation ?? "3d";
    return () => {
      delete document.documentElement.dataset.jgPresentation;
    };
  }, [playable]);
  useEffect(() => {
    if (ctx === null || typeof document === "undefined") return;
    const hud = resolveRigKind(playable.camera) === "none" || playable.presentation === "hud";
    if (!hud) return;
    const frame = requestAnimationFrame(() => {
      document.documentElement.dataset.jgFrameReady = "1";
    });
    return () => {
      cancelAnimationFrame(frame);
      delete document.documentElement.dataset.jgFrameReady;
    };
  }, [ctx, playable]);
  const userId = multiplayer?.userId ?? DEV_USER_ID;
  const reportRuntimeError = (error: unknown, phase: string, componentStack?: string) => {
    const diagnostic = logRuntimeError(error, phase, componentStack);
    setDiagnostics((current) => [...current.slice(-4), { ...diagnostic, id: Date.now() + current.length }]);
  };

  useEffect(() => {
    setDiagnostics([]);
    try {
      const context = createGameContext({
        definition: playable.game,
        content: playable.content,
        player: { userId, isNew: true },
      });
      playable.loop.onInit(context);
      playable.loop.onNewPlayer(context);
      onContextReady?.(context);
      setCtx(context);
    } catch (error) {
      reportRuntimeError(error, "init");
      setCtx(null);
    }
    return () => {
      setCtx(null);
    };
  }, [playable, userId]);

  useEffect(() => {
    if (ctx === null || multiplayer === null) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];

    void multiplayer.backend.transport
      .joinServer({ gameId: multiplayer.gameId })
      .then((joined) => {
        if (disposed) {
          void multiplayer.backend.transport.leaveServer({ serverId: joined.serverId });
          return;
        }
        serverIdRef.current = joined.serverId;

        if (isServerAuthoritative(playable.game.multiplayer) && multiplayer.backend.feeds !== undefined) {
          cleanups.push(attachWorldSync(multiplayer.backend.feeds, joined.serverId, ctx));
        }

        cleanups.push(
          multiplayer.backend.presenceSync.subscribe(joined.serverId, (rows) => {
            setRemotePlayers(rows.filter((row) => row.userId !== multiplayer.userId));
          }),
        );

        const seen = new Set<string>();
        let injecting = false;
        for (const action of multiplayer.feedActions) {
          cleanups.push(
            ctx.game.feed.subscribe(action, (entry) => {
              if (injecting) return;
              void multiplayer.backend
                .pushFeedEntry({
                  serverId: joined.serverId,
                  action,
                  entry: { at: entry.at, data: entry.data, from: multiplayer.userId },
                })
                .catch(() => undefined);
            }),
          );
          const remoteUnsub = multiplayer.backend.feeds?.subscribeFeed(
            { serverId: joined.serverId, action },
            (view) => {
              for (const raw of view.entries) {
                const remote = raw as { at?: number; data?: unknown; from?: string };
                if (typeof remote.from !== "string" || remote.from === multiplayer.userId) continue;
                const key = `${action}|${remote.from}|${remote.at ?? 0}`;
                if (seen.has(key)) continue;
                seen.add(key);
                injecting = true;
                ctx.game.feed.push(action, remote.data);
                injecting = false;
              }
            },
          );
          if (remoteUnsub !== undefined) cleanups.push(remoteUnsub);
        }

        const chatSync = multiplayer.backend.chatSyncFor?.(joined.serverId);
        if (chatSync !== undefined && ctx.game.chat !== undefined) {
          const chat = ctx.game.chat;
          const globalChannelIds = new Set(
            chat
              .channels()
              .filter((channel) => channel.kind === "global")
              .map((channel) => channel.id),
          );
          const seenRemoteChat = new Set<string>();
          cleanups.push(
            ctx.game.events.subscribe("chat.message", (event) => {
              if (event.fromUserId !== multiplayer.userId) return;
              if (!globalChannelIds.has(event.channelId)) return;
              void chatSync.send(event.channelId, event.body).catch(() => undefined);
            }),
          );
          for (const channelId of globalChannelIds) {
            cleanups.push(
              chatSync.subscribe(channelId, (messages) => {
                for (const message of messages) {
                  if (message.fromUserId === multiplayer.userId) continue;
                  if (seenRemoteChat.has(message.id)) continue;
                  seenRemoteChat.add(message.id);
                  chat.send(message.fromUserId, message.channelId, message.body);
                }
              }),
            );
          }
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      const serverId = serverIdRef.current;
      serverIdRef.current = null;
      setRemotePlayers([]);
      if (serverId !== null) {
        void multiplayer.backend.transport.leaveServer({ serverId }).catch(() => undefined);
      }
    };
  }, [ctx, multiplayer, playable]);

  useEffect(() => {
    wrapperRef.current?.focus();
  }, [ctx]);

  useSyncExternalStore(
    ctx?.subscribe ?? (() => () => undefined),
    ctx?.version ?? (() => 0),
    ctx?.version ?? (() => 0),
  );

  if (ctx === null) return <div className="h-full w-full bg-neutral-950" />;

  const GameUI = playable.GameUI;
  const WorldOverlay = playable.WorldOverlay;
  const controlledEntityId = ctx.player.possession.active(userId);
  const cameraConfig =
    playable.camera?.followEntityId !== undefined
      ? playable.camera
      : { ...playable.camera, followEntityId: controlledEntityId };
  const rigKind = resolveRigKind(cameraConfig);

  if (rigKind === "none" || playable.presentation === "hud") {
    const GameUI = playable.GameUI;
    return (
      <div
        ref={wrapperRef}
        tabIndex={0}
        className="relative h-full w-full bg-neutral-950 outline-none"
        onKeyDown={(event) => {
          if (event.code === "F2" && devtoolsEnabled) {
            event.preventDefault();
            f2HeldRef.current = true;
            f2ChordedRef.current = false;
            return;
          }
          if (f2HeldRef.current) {
            f2ChordedRef.current = true;
            return;
          }
          if (event.code === "Tab" || event.code === "Space") event.preventDefault();
          if (playControlsActive(ctx)) tracker.handleDown(event.code);
        }}
        onKeyUp={(event) => {
          if (event.code === "F2" && devtoolsEnabled) {
            f2HeldRef.current = false;
            if (!f2ChordedRef.current) setDevtoolsOpen((current) => !current);
            return;
          }
          if (playControlsActive(ctx)) tracker.handleUp(event.code);
        }}
        onBlur={() => {
          f2HeldRef.current = false;
          tracker.reset();
        }}
        onPointerDown={() => audioEngine.resume()}
        onPointerMove={trackPointerAxis}
        onPointerLeave={deactivatePointerAxis}
        onPointerCancel={deactivatePointerAxis}
      >
        <GameViewportProvider platforms={playable.platforms}>
        <HudOnlyDriver
          ctx={ctx}
          playable={playable}
          tracker={tracker}
          pointerAxisRef={pointerAxisRef}
          gateRef={gateRef}
          onRuntimeError={reportRuntimeError}
        />
        {!orientationGate && coarsePointer && touchScheme !== null && touchScheme.gestures !== null && playControlsActive(ctx) ? (
          <TouchPlaySurface
            scheme={touchScheme}
            sink={touchSink}
            yawRef={yawRef}
            pitchRef={pitchRef}
            maxPitch={0}
            onPrimaryTap={() => undefined}
          />
        ) : null}
        <GameUiErrorBoundary onRuntimeError={reportRuntimeError}>
          <GameProvider context={ctx}>
            <HudViewportProvider
              platforms={playable.platforms}
              config={playable.hudFit}
              userScale={graphics.uiScale}
            >
              {orientationGate ? null : <GameUI />}
            </HudViewportProvider>
          </GameProvider>
        </GameUiErrorBoundary>
        {orientationGateEl}
        {devtoolsEnabled ? (
          <DevtoolsOverlay open={devtoolsOpen} ctx={ctx} playable={playable} multiplayer={multiplayer} />
        ) : null}
        <DiagnosticOverlay diagnostics={diagnostics} gameName={playable.game.name} />
        </GameViewportProvider>
      </div>
    );
  }

  const firstPerson = rigKind === "first";
  const showReticle =
    (firstPerson && playable.camera?.firstPerson?.reticle !== false) || rigKind === "shoulder";
  const rtsPanKeysEnabled = !rtsPanKeysConflict(playable.game.input);
  const worldBars = playable.worldHealthBars;
  const barsStatId =
    worldBars === undefined || worldBars === false
      ? null
      : worldBars === true
        ? "health"
        : worldBars.statId ?? "health";
  const barsRoles =
    worldBars === undefined || worldBars === true || worldBars === false ? undefined : worldBars.roles;
  const barsMaxDistance =
    worldBars === undefined || worldBars === true || worldBars === false
      ? undefined
      : worldBars.maxDistance;
  const resolveEntityRole = (entity: SceneEntity) => playable.content.entityById?.(entity.name)?.role;

  const pointer: PointerConfig | undefined = playable.pointer;
  const pointerUsesLeft = pointer !== undefined && (pointer.select === true || pointer.moveCommand !== undefined);
  const selectFilter = pointer?.selectFilter;
  const worldSky = resolveWorldSky(playable.game.world);
  const world = playable.game.world;
  const biomeBands = world?.kind === "environment" ? world.terrain?.biomeBands : undefined;
  const AutoEnvironment =
    playable.environment ??
    (world?.kind === "environment"
      ? () => <EnvironmentScene feature={world} />
      : world?.kind === "biomes" || world?.kind === "voxel" || world?.kind === "plots" || world?.kind === "tilemap"
        ? () => <GridWorldScene feature={world} />
        : undefined);
  const backdrop = playable.backdrop;
  const backdropSky = backdrop?.sky !== undefined ? resolveSkyDescriptor(backdrop.sky) : undefined;
  const effectiveSky = backdropSky ?? worldSky;
  const backgroundColor = backdrop?.background ?? (effectiveSky === undefined ? DEFAULT_BACKGROUND_COLOR : undefined);
  const lighting = playable.lighting;
  const orthographic = playable.camera?.projection === "orthographic";

  const localXY = (event: { clientX: number; clientY: number }) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    return rect === undefined
      ? { x: event.clientX, y: event.clientY }
      : { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const commitSelection = (ids: string[]) => {
    selection.replace(ids);
    setSelectedIds(new Set(ids));
  };

  const finishMarquee = (rect: ScreenRect) => {
    const candidates: { id: string; x: number; y: number }[] = [];
    for (const entity of ctx.scene.entity.list()) {
      if (selectFilter !== undefined && !selectFilter(entity.id)) continue;
      const screen = pointerService.screenOf(entity.position);
      if (screen !== null) candidates.push({ id: entity.id, x: screen.x, y: screen.y });
    }
    commitSelection(selectWithinRect(candidates, rect));
  };

  /** DOM UI (menus, HUD buttons) sits in the same wrapper as the canvas — only canvas-targeted clicks are world input. */
  const isWorldPointerTarget = (event: { target: EventTarget | null }) =>
    event.target instanceof HTMLCanvasElement;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isWorldPointerTarget(event)) wrapperRef.current?.focus();
    trackPointerAxis(event);
    audioEngine.resume();
    if (contextMenu !== null) setContextMenu(null);
    if (event.button === 0 && isWorldPointerTarget(event)) {
      const point = localXY(event);
      pointerDownRef.current = point;
      if (pointer?.select === true) marqueeStartRef.current = point;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    trackPointerAxis(event);
    if (pointer?.select !== true) return;
    const start = marqueeStartRef.current;
    if (start === null || (event.buttons & 1) === 0) return;
    const point = localXY(event);
    setMarquee(screenRect(start.x, start.y, point.x, point.y));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || pointerDownRef.current === null) return;
    const start = pointerDownRef.current;
    pointerDownRef.current = null;
    marqueeStartRef.current = null;
    const end = localXY(event);
    const rect = screenRect(start.x, start.y, end.x, end.y);
    const wasMarquee = marquee !== null && isMarquee(rect, PRIMARY_CLICK_MOVE_THRESHOLD_PX);
    setMarquee(null);
    if (pointer?.select === true && wasMarquee) {
      finishMarquee(rect);
      return;
    }
    if (cameraDraggingRef.current) return;
    if (pointer?.grabWorldItems === true) {
      const hit = pointerService.worldHit();
      const itemInstanceId = hit?.entity ?? null;
      const record = itemInstanceId === null ? null : ctx.scene.worldItem.get(itemInstanceId);
      if (record !== null && itemInstanceId !== null) {
        const itemEntity = ctx.scene.entity.get(itemInstanceId);
        const localPlayer = ctx.scene.entity.get(ctx.player.userId);
        const pickupRadius = playable.worldItem?.pickupRadius ?? DEFAULT_PICKUP_RADIUS;
        const withinRadius =
          itemEntity !== null &&
          localPlayer !== null &&
          Math.hypot(
            localPlayer.position[0] - itemEntity.position[0],
            localPlayer.position[1] - itemEntity.position[1],
            localPlayer.position[2] - itemEntity.position[2],
          ) <= pickupRadius;
        if (withinRadius) {
          ctx.scene.worldItem.pickup(itemInstanceId, ctx.player.userId);
          return;
        }
      }
    }
    if (pointer?.select === true) {
      const hit = pointerService.worldHit();
      if (hit !== null && hit.entity !== null && (selectFilter === undefined || selectFilter(hit.entity))) {
        commitSelection([hit.entity]);
      } else {
        commitSelection([]);
      }
      return;
    }
    if (pointer?.moveCommand !== undefined) {
      const hit = pointerService.worldHit();
      if (hit !== null && ctx.game.commands.has(pointer.moveCommand)) {
        ctx.game.commands.run(pointer.moveCommand, { point: hit.point, entity: hit.entity, object: hit.object });
      }
      return;
    }
    const moved = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
    if (moved <= PRIMARY_CLICK_MOVE_THRESHOLD_PX * PRIMARY_CLICK_MOVE_THRESHOLD_PX) primaryClickRef.current = true;
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (pointer === undefined) return;
    if (!isWorldPointerTarget(event)) return;
    event.preventDefault();
    const hit = pointerService.worldHit();
    if (hit === null) return;
    if (pointer.contextMenu === true && (hit.entity !== null || hit.object !== null)) {
      const menu = pointerContextMenu(ctx, playable, hit);
      if (menu !== null) {
        const point = localXY(event);
        setContextMenu({ menu, x: point.x, y: point.y });
        return;
      }
    }
    if (pointer.select === true && pointer.orderCommand !== undefined && selection.size() > 0) {
      if (ctx.game.commands.has(pointer.orderCommand)) {
        ctx.game.commands.run(pointer.orderCommand, { selection: selection.list(), point: hit.point });
      }
      return;
    }
    if (pointer.secondaryCommand !== undefined && ctx.game.commands.has(pointer.secondaryCommand)) {
      const aim: Aim = (pointer.aim === true ? pointerAimFor(ctx, pointerService) : undefined) ?? {
        yaw: yawRef.current,
        pitch: pitchRef.current,
      };
      ctx.game.commands.run(pointer.secondaryCommand, { point: hit.point, entity: hit.entity, object: hit.object, aim });
    }
  };

  const handleVerbPick = (verb: ContextVerb) => {
    const state = contextMenu;
    setContextMenu(null);
    if (state !== null && ctx.game.commands.has(verb.command)) {
      ctx.game.commands.run(verb.command, contextVerbInput(state.menu, verb));
    }
  };

  const controlsActive = playControlsActive(ctx);
  const settingsDisabled = playable.settings === false;
  const settingsConfig: GameSettingsConfig =
    playable.settings === false || playable.settings === undefined ? {} : playable.settings;
  const settingsSurface = settingsDisabled ? false : settingsConfig.surface ?? false;
  const settingsVariant = settingsConfig.variant ?? "panel";
  const hideCategories = settingsDisabled ? BUILT_IN_SETTING_CATEGORIES : settingsConfig.hide ?? [];
  const fovControlEnabled = !orthographic && playable.camera?.playerFov?.control !== false;
  const settingsHostsFov = !settingsDisabled && !hideCategories.includes("gameplay") && fovControlEnabled;
  const settingsActions: SettingsActionView[] = settingsDisabled
    ? []
    : (settingsConfig.actions ?? []).map((action) => ({
        id: action.id,
        label: action.label,
        kind: action.kind ?? "default",
        description: action.description,
        run: () => action.run(ctx),
      }));
  const touchScale = compact ? 0.88 : 1;
  const touchStyle = useTouchStyle(settingsStore, touchScheme?.style ?? DEFAULT_TOUCH_STYLE);
  const dockMounted =
    !poster &&
    !orientationGate &&
    coarsePointer &&
    controlsActive &&
    touchScheme !== null &&
    (touchScheme.joystick !== null || touchScheme.buttons.length > 0);

  return (
    <SettingsProvider store={settingsStore}>
    <PlayerFovProvider config={playable.camera} orthographic={orthographic}>
    <AudioSettingsBridge store={settingsStore} engine={audioEngine} buses={playable.audio?.buses} />
    <SettingsRuntime
      variant={settingsVariant}
      surface={settingsSurface}
      actions={settingsActions}
      input={playable.game.input ?? {}}
      buses={playable.audio?.buses}
      extra={settingsConfig.extra ?? []}
      categories={settingsConfig.categories ?? []}
      hide={hideCategories}
      fovEnabled={fovControlEnabled}
      hideBindings={settingsConfig.hideBindings ?? []}
      touchStyle={
        coarsePointer &&
        touchScheme !== null &&
        (touchScheme.joystick !== null || touchScheme.buttons.length > 0)
      }
      overrides={bindingOverrides}
      rebind={rebindAction}
      resetBinding={resetActionBinding}
    >
    <div
      ref={wrapperRef}
      tabIndex={0}
      {...(poster && posterFrozen ? { "data-poster-ready": "" } : {})}
      className="relative h-full w-full bg-neutral-950 outline-none"
      style={
        {
          "--jg-hud-dock-clearance": `${dockMounted ? touchDockClearance(touchScheme, touchScale) : 0}px`,
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (event.code === "F2" && devtoolsEnabled) {
          event.preventDefault();
          f2HeldRef.current = true;
          f2ChordedRef.current = false;
          return;
        }
        if (f2HeldRef.current) {
          f2ChordedRef.current = true;
          return;
        }
        if (event.code === "Tab" || event.code === "Space") event.preventDefault();
        if (playControlsActive(ctx)) tracker.handleDown(event.code);
      }}
      onKeyUp={(event) => {
        if (event.code === "F2" && devtoolsEnabled) {
          f2HeldRef.current = false;
          if (!f2ChordedRef.current) {
            document.exitPointerLock?.();
            setDevtoolsOpen((current) => !current);
          }
          return;
        }
        if (playControlsActive(ctx)) tracker.handleUp(event.code);
      }}
      onBlur={() => {
        f2HeldRef.current = false;
        tracker.reset();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={deactivatePointerAxis}
      onPointerCancel={deactivatePointerAxis}
      onContextMenu={handleContextMenu}
      onWheel={(event) => {
        if (ctx === null || !event.shiftKey) return;
        event.preventDefault();
        if (event.deltaY < 0 && ctx.game.commands.has("ui.hotbarScrollNext")) {
          ctx.game.commands.run("ui.hotbarScrollNext", {});
        } else if (event.deltaY > 0 && ctx.game.commands.has("ui.hotbarScrollPrev")) {
          ctx.game.commands.run("ui.hotbarScrollPrev", {});
        }
      }}
    >
      <GameViewportProvider platforms={playable.platforms}>
      <Canvas
        frameloop={poster && posterFrozen ? "demand" : "always"}
        orthographic={orthographic}
        camera={
          orthographic
            ? {
                zoom: playable.camera?.frustum?.zoom ?? CAMERA_FRUSTUM_DEFAULTS.zoom,
                near: playable.camera?.frustum?.near ?? CAMERA_FRUSTUM_DEFAULTS.near,
                far: playable.camera?.frustum?.far ?? CAMERA_FRUSTUM_DEFAULTS.far,
              }
            : {
                fov: playable.camera?.frustum?.fov ?? CAMERA_FRUSTUM_DEFAULTS.fov,
                near: playable.camera?.frustum?.near ?? CAMERA_FRUSTUM_DEFAULTS.near,
                far: playable.camera?.frustum?.far ?? CAMERA_FRUSTUM_DEFAULTS.far,
              }
        }
        shadows={graphics.shadows}
        dpr={graphics.dpr}
        gl={{ preserveDrawingBuffer: true }}
        style={{ touchAction: "none" }}
      >
        {backgroundColor !== undefined ? <color attach="background" args={[backgroundColor]} /> : null}
        {lighting !== undefined ? (
          <ConfiguredLighting lighting={lighting} />
        ) : effectiveSky === undefined ? (
          <>
            <ambientLight intensity={0.55} />
            <directionalLight position={[10, 16, 6]} intensity={1.3} />
          </>
        ) : null}
        {effectiveSky !== undefined ? (
          effectiveSky.timeOfDay ? (
            <TimeOfDayDaylight
              sky={effectiveSky}
              clock={ctx.time}
              bands={effectiveSky === worldSky ? biomeBands : undefined}
              lights={skyEmitsLights(resolveSkyLightOwnership(lighting !== undefined))}
            />
          ) : (
            <SkyDaylight
              sky={effectiveSky}
              bands={effectiveSky === worldSky ? biomeBands : undefined}
              lights={skyEmitsLights(resolveSkyLightOwnership(lighting !== undefined))}
            />
          )
        ) : null}
        <BackdropFog fog={backdrop?.fog} />
        <GameProvider context={ctx}>
          <CullingProvider config={playable.visibility}>
            <WorldView
              entitySprites={playable.entitySprites}
              entityModels={playable.entityModels}
              objectModels={playable.objectModels}
              objectStyles={playable.objectStyles}
              environment={AutoEnvironment}
              assets={playable.game.assets}
              renderEntity={playable.renderEntity}
              renderObject={playable.renderObject}
              selectedIds={selectedIds}
              hideLocalActor={firstPerson}
            />
          </CullingProvider>
          {WorldOverlay !== undefined ? <WorldOverlay /> : null}
          {barsStatId !== null ? (
            <WorldEntityBars
              statId={barsStatId}
              roles={barsRoles}
              resolveRole={resolveEntityRole}
              {...(barsMaxDistance === undefined ? {} : { maxDistance: barsMaxDistance })}
            />
          ) : null}
          <WorldItems config={playable.worldItem} />
          <WorldTelegraphs />
          <WorldFloatText />
          <ProjectileTracers />
          {devtoolsEnabled ? <CollisionDebugWorld /> : null}
          <CombatCameraShake />
          <AudioListener engine={audioEngine} />
          <EntityAudioEmitters engine={audioEngine} entitySounds={playable.entitySounds} />
          <ObjectAudioEmitters engine={audioEngine} objectSounds={playable.objectSounds} />
          <GameCameraRig
            yawRef={yawRef}
            pitchRef={pitchRef}
            config={cameraConfig}
            pointerControls={pointerUsesLeft}
            panKeysEnabled={rtsPanKeysEnabled}
            director={ctx.camera}
            onDragChange={(dragging) => {
              cameraDraggingRef.current = dragging;
            }}
          />
          <PointerProbe service={pointerService} />
        </GameProvider>
        <RemotePlayers rows={remotePlayers} />
        <FrameDriver
          ctx={ctx}
          playable={playable}
          tracker={tracker}
          yawRef={yawRef}
          pitchRef={pitchRef}
          primaryClickRef={primaryClickRef}
          pointerAxisRef={pointerAxisRef}
          gateRef={gateRef}
          onRuntimeError={reportRuntimeError}
          multiplayer={multiplayer}
          serverIdRef={serverIdRef}
          pointerService={pointerService}
          pointerAim={pointer?.aim === true}
          pingCommand={pointer?.pingCommand}
          poster={poster}
          onPosterSettled={() => {
            if (posterSettledRef.current) return;
            posterSettledRef.current = true;
            setPosterFrozen(true);
          }}
        />
        <DevtoolsRendererProbe />
        {playable.postProcessing !== undefined && playable.postProcessing.enabled !== false ? (
          <PostProcessing config={playable.postProcessing} />
        ) : null}
      </Canvas>
      {!poster && !orientationGate && coarsePointer && controlsActive && touchScheme !== null && (touchScheme.gestures !== null || touchScheme.look) ? (
        <TouchPlaySurface
          scheme={touchScheme}
          sink={touchSink}
          yawRef={yawRef}
          pitchRef={pitchRef}
          maxPitch={playable.camera?.firstPerson?.maxPitch ?? 1.45}
          onPrimaryTap={() => {
            primaryClickRef.current = true;
          }}
        />
      ) : null}
      <GameUiErrorBoundary onRuntimeError={reportRuntimeError}>
        <GameProvider context={ctx}>
          <HudViewportProvider
            platforms={playable.platforms}
            config={playable.hudFit}
            userScale={graphics.uiScale}
          >
            {orientationGate ? null : <GameUI />}
          </HudViewportProvider>
        </GameProvider>
      </GameUiErrorBoundary>
      {!poster && !orientationGate && showReticle ? <Reticle /> : null}
      {dockMounted && touchScheme !== null ? (
        <TouchControlsDock scheme={touchScheme} sink={touchSink} style={touchStyle} scale={touchScale} />
      ) : null}
      {orientationGateEl}
      {marquee !== null ? <MarqueeBox rect={marquee} /> : null}
      {contextMenu !== null ? (
        <ContextMenuView
          menu={contextMenu.menu}
          x={contextMenu.x}
          y={contextMenu.y}
          onPick={handleVerbPick}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      {devtoolsEnabled ? (
        <DevtoolsOverlay open={devtoolsOpen} ctx={ctx} playable={playable} multiplayer={multiplayer} />
      ) : null}
      {poster ? null : <DiagnosticOverlay diagnostics={diagnostics} gameName={playable.game.name} />}
      {poster || orthographic || settingsHostsFov ? null : <PlayerFovSlider />}
      {poster ? null : <SettingsChrome />}
      </GameViewportProvider>
    </div>
    </SettingsRuntime>
    </PlayerFovProvider>
    </SettingsProvider>
  );
}
