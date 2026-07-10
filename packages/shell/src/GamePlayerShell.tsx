import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  actionRepeatMs,
  createActionStateTracker,
  hotbarSlotActionIndex,
  resolveActionCommand,
  shouldDispatchAction,
  toActionStateBindingMap,
  type ActionStateTracker,
} from "@jgengine/core/input/actionBindings";
import { deriveTouchScheme, withTouchCodes } from "@jgengine/core/input/touchScheme";
import {
  buildContextMenu,
  contextVerbInput,
  type ContextMenu,
  type ContextVerb,
} from "@jgengine/core/interaction/contextMenu";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import { aimToPoint } from "@jgengine/core/input/pointer";
import type { Aim } from "@jgengine/core/scene/spatial";
import {
  createSelectionSet,
  isMarquee,
  screenRect,
  selectWithinRect,
  type ScreenRect,
} from "@jgengine/core/scene/selection";
import {
  advancePlayerMotion,
  constrainStepToAxis,
  createEmptyMovementKeys,
  createPlayerMotionState,
  resolveMovementIntent,
  resolveObstacleStep,
  snapPositionToGrid,
  type CollisionObstacle,
  type MovementTuningOverrides,
} from "@jgengine/core/movement/movementModel";
import { steerYaw } from "@jgengine/core/movement/steering";
import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import {
  advanceVoxelPlayer,
  createVoxelPlayerBody,
  type VoxelPlayerBody,
} from "@jgengine/core/movement/voxelController";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { MotionIntentBatch } from "@jgengine/core/runtime/motionIntents";
import { groundFieldFor } from "@jgengine/core/world/terrain";
import type { SkyEnvironmentDescriptor, WorldFeature } from "@jgengine/core/world/features";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { objectVisualScale, type SceneObject } from "@jgengine/core/scene/objectStore";
import { DEFAULT_PICKUP_RADIUS, WORLD_ITEM_ENTITY_NAME } from "@jgengine/core/game/worldItem";
import { useGameContext } from "@jgengine/react/provider";
import { useDisplayProfile } from "@jgengine/react/display";
import { useSceneEntities, useSceneObjects, usePlayer, useTarget } from "@jgengine/react/hooks";
import { GameProvider } from "@jgengine/react/provider";
import type { PresencePoseRow } from "@jgengine/core/runtime/transport";

import type {
  BackdropConfig,
  EntitySpriteConfig,
  LightingConfig,
  ModelConfig,
  MovementCommitFrame,
  ObjectStyle,
  PointerConfig,
} from "@jgengine/core/game/playableGame";
import { CAMERA_FRUSTUM_DEFAULTS } from "@jgengine/core/game/playableGame";
import { sky as resolveSkyDescriptor } from "@jgengine/core/world/features";

import { devtools } from "@jgengine/core/devtools/devtools";

import { AudioListener, EntityAudioEmitters, ObjectAudioEmitters } from "./audio/AudioComponents";
import { createAudioEngine } from "./audio/audioEngine";
import { DevtoolsOverlay, DevtoolsRendererProbe, withDevtoolsLatency } from "./devtools/DevtoolsOverlay";
import { GAME_SIM_FRAME_PRIORITY, GameCameraRig, resolveRigKind, rtsPanKeysConflict } from "./camera";
import { SkyDaylight, TimeOfDayDaylight } from "./environment";
import { EnvironmentScene } from "./environment/EnvironmentScene";
import { applyMaterialOverride } from "./materialOverride";
import { PointerProbe } from "./pointer/PointerProbe";
import {
  applyPaintTexture,
  cloneModelScene,
  createPaintCanvas,
  standardMaterialsOf,
  syncPaintCanvas,
  type PaintCanvas,
} from "./render/modelRender";
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
}

function errorToDiagnostic(error: unknown, phase: string): Omit<RuntimeDiagnostic, "id"> {
  if (error instanceof Error) {
    return { phase, message: error.message, stack: error.stack };
  }
  return { phase, message: typeof error === "string" ? error : JSON.stringify(error) };
}

function logRuntimeError(error: unknown, phase: string): Omit<RuntimeDiagnostic, "id"> {
  const diagnostic = errorToDiagnostic(error, phase);
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
  const player = ctx.scene.entity.get(ctx.player.userId);
  const origin = player === null ? hit.point : player.position;
  return aimToPoint([origin[0], origin[1] + 1, origin[2]], hit.point);
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
export function dispatchBoundAction(ctx: GameContext, action: string, yaw: number, pitch: number, aim: Aim): void {
  const command = resolveActionCommand(action, (name) => ctx.game.commands.has(name), RESERVED_INPUT_ACTIONS);
  if (command !== null) ctx.game.commands.run(command, { yaw, pitch, aim });
}

const OBSTACLE_GATHER_RADIUS = 3;

/** Placed scene objects within `radius` of `center`, as `CollisionObstacle`s for `resolveObstacleStep` (#162.1). */
export function nearbyObstacles(
  objects: readonly SceneObject[],
  center: readonly [number, number, number],
  radius: number = OBSTACLE_GATHER_RADIUS,
): CollisionObstacle[] {
  const radiusSq = radius * radius;
  const result: CollisionObstacle[] = [];
  for (const object of objects) {
    const dx = object.position[0] - center[0];
    const dz = object.position[2] - center[2];
    if (dx * dx + dz * dz <= radiusSq) result.push({ position: object.position });
  }
  return result;
}

/** Applies a pending `MotionIntentBatch` to a vertical velocity: impulses add, then `verticalVelocity` replaces the result outright (#162.4). */
export function applyMotionImpulses(currentVelocity: number, batch: MotionIntentBatch | null): number {
  if (batch === null) return currentVelocity;
  let velocity = currentVelocity;
  for (const impulse of batch.impulses) velocity += impulse;
  return batch.verticalVelocity ?? velocity;
}

/** The world's declared sky, when its world feature is an environment with one (#196.1). */
export function resolveWorldSky(world: WorldFeature | undefined): SkyEnvironmentDescriptor | undefined {
  return world?.kind === "environment" ? world.sky : undefined;
}

/**
 * Maps the game's declared `physics` onto the movement controllers' tuning
 * overrides. `PhysicsConfig.gravity` is a signed world acceleration (negative
 * points down, matching every game's config and the Y-up convention), but the
 * controllers integrate `velocityY -= gravityAcceleration * dt` and so expect a
 * positive downward magnitude. Negating here is what keeps a down-pointing
 * gravity pulling the player *down*; passing the signed value straight through
 * flipped the sign and launched airborne players upward instead.
 */
export function resolvePhysicsTuning(physics: PhysicsConfig | undefined): MovementTuningOverrides | undefined {
  if (physics === undefined) return undefined;
  return {
    get gravityAcceleration() {
      return physics.gravity === undefined ? undefined : -physics.gravity;
    },
    get jumpVelocity() {
      return physics.jumpVelocity;
    },
  };
}

/** True when the world is an environment feature with terrain, so the voxel controller should sample its height. */
export function hasEnvironmentTerrain(world: WorldFeature | undefined): boolean {
  return world?.kind === "environment" && world.terrain !== undefined;
}

function colorFromId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return `hsl(${hash % 360}, 65%, 55%)`;
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
        <directionalLight
          key={index}
          position={[entry.position[0], entry.position[1], entry.position[2]]}
          intensity={entry.intensity ?? 1.3}
          color={entry.color}
          castShadow={entry.castShadow ?? false}
        />
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

function EntityModel({ model, instanceId }: { model: ModelConfig; instanceId?: string }) {
  const gltf = useLoader(GLTFLoader, model.url);
  const ctx = useGameContext();
  const material = model.material;
  const scale = model.scale ?? 1;
  const baseY = model.y ?? 0;
  const dims = model.dims;
  const centered = (model.anchor ?? "center") === "center" && dims !== undefined;
  const position: [number, number, number] = centered
    ? [-scale * dims!.center.x, baseY - scale * dims!.minY, -scale * dims!.center.z]
    : [0, baseY, 0];

  const scene = useMemo(() => {
    const cloned = cloneModelScene(gltf.scene);
    if (material !== undefined) applyMaterialOverride(cloned, material);
    return cloned;
  }, [gltf, material]);

  const animation = model.animation;
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationPausedRef = useRef(false);

  useEffect(() => {
    if (animation === undefined || gltf.animations.length === 0) {
      mixerRef.current = null;
      return;
    }
    const mixer = new THREE.AnimationMixer(scene);
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
  }, [scene, gltf, animation?.clip, animation?.loop, animation?.timeScale, animation?.paused, animation?.time]);

  const paintCanvasRef = useRef<PaintCanvas | null>(null);
  const paintDrawnCountRef = useRef(0);
  const paintVersionRef = useRef(-1);

  useEffect(() => {
    paintCanvasRef.current = null;
    paintDrawnCountRef.current = 0;
    paintVersionRef.current = -1;
  }, [scene]);

  useFrame((_state, delta) => {
    if (mixerRef.current !== null && !animationPausedRef.current) mixerRef.current.update(delta);
    if (instanceId === undefined) return;
    const paint = ctx.scene.entity.paint;
    const version = paint.version(instanceId);
    if (version === paintVersionRef.current) return;
    paintVersionRef.current = version;
    const strokes = paint.strokes(instanceId);
    if (paintCanvasRef.current === null) {
      if (strokes.length === 0) return;
      const materials = standardMaterialsOf(scene);
      const seed = materials[0];
      if (seed === undefined) return;
      const paintCanvas = createPaintCanvas(seed);
      paintCanvasRef.current = paintCanvas;
      applyPaintTexture(scene, paintCanvas);
    }
    const seedColor = standardMaterialsOf(scene)[0]?.color ?? new THREE.Color("#ffffff");
    paintDrawnCountRef.current = syncPaintCanvas(paintCanvasRef.current, seedColor, strokes, paintDrawnCountRef.current);
  });

  return <primitive object={scene} position={position} scale={[scale, scale, scale]} />;
}

function resolveModel(
  value: string | ModelConfig | undefined,
  assets: AssetCatalog,
): ModelConfig | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return value;
  const ref = assets.resolve(value);
  if (ref === null) return undefined;
  return ref.dims === undefined ? { url: ref.url } : { url: ref.url, dims: ref.dims };
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
  const color = isLocal ? "#4ade80" : entity.role === "npc" ? colorFromId(entity.name) : "#9ca3af";
  return (
    <group
      position={[entity.position[0], entity.position[1], entity.position[2]]}
      rotation-y={entity.rotationY}
      userData={{ [POINTER_ENTITY_KEY]: entity.id }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!isLocal) onSelect(entity);
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
        <EntityModel model={model} instanceId={entity.id} />
      ) : sprite !== undefined ? (
        <EntitySprite sprite={sprite} />
      ) : entity.role === "prop" ? (
        <mesh position-y={0.5}>
          <sphereGeometry args={[0.45, 16, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ) : (
        <>
          <mesh position-y={0.95}>
            <capsuleGeometry args={[0.35, 1.1, 6, 14]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 1.35, 0.32]}>
            <boxGeometry args={[0.16, 0.16, 0.16]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        </>
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
  const [scaleX, scaleY, scaleZ] = objectVisualScale(object.visual);
  const color = object.visual?.color ?? style?.color ?? colorFromId(object.catalogId);
  const opacity = object.visual?.opacity ?? style?.opacity ?? 1;
  return (
    <group
      position={[object.position[0], object.position[1], object.position[2]]}
      rotation-y={object.rotationY}
      userData={{ [POINTER_OBJECT_KEY]: object.instanceId }}
    >
      {custom !== undefined && custom !== null ? (
        custom
      ) : model !== undefined ? (
        <EntityModel model={model} instanceId={object.instanceId} />
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

function WorldView({
  entitySprites,
  entityModels,
  objectModels,
  objectStyles,
  environment: Environment,
  assets,
  renderEntity,
  renderObject,
  selectedIds,
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
}) {
  const ctx = useGameContext();
  const entities = useSceneEntities();
  const objects = useSceneObjects();
  const player = usePlayer();
  const targetId = useTarget(player.userId);
  const controlledId = ctx.player.possession.active(player.userId);
  const handleSelect = (entity: SceneEntity) => {
    const relation = ctx.scene.entity.canReceive(entity.id, "damage") === null ? "hostile" : "friendly";
    ctx.scene.entity.setTarget(controlledId, relation === "hostile" || entity.role === "npc" ? entity.id : null);
  };
  return (
    <>
      {Environment !== undefined ? (
        <Environment />
      ) : (
        <>
          <GroundPlane />
          <gridHelper args={[160, 80, "#3a3f4a", "#2b2f38"]} position-y={0.01} />
          <RockField />
        </>
      )}
      {entities
        .filter((entity) => entity.name !== WORLD_ITEM_ENTITY_NAME)
        .map((entity) => (
        <EntityMarker
          key={entity.id}
          entity={entity}
          custom={renderEntity?.(entity)}
          model={resolveModel(entityModels?.[entity.name], assets)}
          sprite={entitySprites?.[entity.name]}
          isLocal={entity.id === controlledId}
          targeted={entity.id === targetId}
          selected={selectedIds.has(entity.id)}
          onSelect={handleSelect}
        />
      ))}
      {objects.map((object) => {
        const model =
          resolveModel(objectModels?.[object.catalogId], assets) ??
          resolveModel(object.catalogId, assets);
        return (
          <ObjectMarker
            key={object.instanceId}
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
  const motionRef = useRef(createPlayerMotionState());
  const voxelBodyRef = useRef<VoxelPlayerBody | null>(null);
  const solidCacheRef = useRef<{ count: number; set: Set<string> }>({ count: -1, set: new Set() });
  const hasReportedTickError = useRef(false);
  const repeatFiredAtRef = useRef<Map<string, number>>(new Map());
  const slotActions = useMemo(() => findHotbarSlotActions(playable.game.input), [playable]);
  const hotbarId = useMemo(() => hotbarIdFor(playable), [playable]);
  const collision = playable.collision;
  const movement = playable.movement;
  const voxelDims = useMemo(
    () => ({
      get halfWidth() {
        return collision?.halfWidth ?? 0.3;
      },
      get height() {
        return collision?.height ?? 1.8;
      },
      get stepHeight() {
        return collision?.stepHeight ?? 0.6;
      },
    }),
    [collision],
  );
  const movementTuning = useMemo(() => resolvePhysicsTuning(playable.game.physics), [playable]);
  const autoPickupRadius = useMemo(() => {
    const cfg = playable.worldItem?.autoPickup;
    if (cfg === undefined || cfg === false) return null;
    const fallback = playable.worldItem?.pickupRadius ?? DEFAULT_PICKUP_RADIUS;
    return cfg === true ? fallback : cfg.radius ?? fallback;
  }, [playable]);
  const ground = useMemo(() => groundFieldFor(playable.game.world), [playable]);
  const drivesPose = useMemo(() => shellDrivesPlayerPose(playable.game.input), [playable]);
  const inputActions = useMemo(() => Object.keys(playable.game.input ?? {}), [playable]);
  const hasTerrain = useMemo(() => hasEnvironmentTerrain(playable.game.world), [playable]);

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
    const simStart = performance.now();
    try {
    let endPhase = devtools.profile.begin("time+input");
    const dt = Math.min(rawDt, 0.05);
    const gameDt = ctx.time.advance(dt);
    ctx.input.publish(heldActionsFor(tracker, inputActions));
    const turnInput = (tracker.isDown("turnRight") ? 1 : 0) - (tracker.isDown("turnLeft") ? 1 : 0);
    if (turnInput !== 0) yawRef.current = steerYaw(yawRef.current, turnInput, TURN_SPEED, dt);
    endPhase();

    const playerId = ctx.player.possession.active(ctx.player.userId);
    const player = ctx.scene.entity.get(playerId);
    const forwardX = Math.sin(yawRef.current);
    const forwardZ = Math.cos(yawRef.current);
    if (player !== null && drivesPose) {
      endPhase = devtools.profile.begin("pose");
      const keys = createEmptyMovementKeys();
      keys.w = tracker.isDown("moveForward");
      keys.s = tracker.isDown("moveBack");
      keys.a = tracker.isDown("moveLeft");
      keys.d = tracker.isDown("moveRight");
      keys.shift = tracker.isDown("sprint");
      keys.space = tracker.isDown("jump");
      const intent = resolveMovementIntent(keys, true);
      const motionBatch = ctx.player.motion.takePending();
      if (collision?.voxel) {
        let body = voxelBodyRef.current;
        if (body === null) {
          body = createVoxelPlayerBody(player.position[0], player.position[1], player.position[2]);
          voxelBodyRef.current = body;
        }
        const objects = ctx.scene.object.list();
        const cache = solidCacheRef.current;
        if (cache.count !== objects.length) {
          cache.set = new Set(objects.map((o) => `${o.position[0]},${o.position[1]},${o.position[2]}`));
          cache.count = objects.length;
        }
        const solids = cache.set;
        const isSolid = (x: number, y: number, z: number) => solids.has(`${x},${y},${z}`);
        body.velocityY = applyMotionImpulses(body.velocityY, motionBatch);
        advanceVoxelPlayer(
          body,
          intent,
          forwardX,
          forwardZ,
          player.movement.walkSpeed ?? 2,
          rawDt,
          isSolid,
          voxelDims,
          movementTuning,
          hasTerrain ? (x, z) => ground.sampleHeight(x, z) : undefined,
        );
        if (motionBatch !== null && motionBatch.y !== null) body.y = motionBatch.y;
        ctx.scene.entity.setPose(playerId, {
          position: [body.x, body.y, body.z],
          rotationY: intent.moving
            ? Math.atan2(body.velocityX, body.velocityZ)
            : player.rotationY,
          dt: rawDt,
        });
      } else {
        const motion = motionRef.current;
        motion.verticalVelocity = applyMotionImpulses(motion.verticalVelocity, motionBatch);
        const step = advancePlayerMotion(
          motion,
          intent,
          forwardX,
          forwardZ,
          player.movement.walkSpeed ?? 2,
          rawDt,
          movementTuning,
        );
        let stepX = step.stepX;
        let stepZ = step.stepZ;
        if (movement?.mode === "axis") {
          const constrained = constrainStepToAxis(stepX, stepZ, movement.axis ?? "x");
          stepX = constrained.stepX;
          stepZ = constrained.stepZ;
        }
        if (movement?.collideObjects === true) {
          const obstacles = nearbyObstacles(ctx.scene.object.list(), player.position);
          const resolved = resolveObstacleStep(player.position, stepX, stepZ, obstacles);
          stepX = resolved.stepX;
          stepZ = resolved.stepZ;
        }
        let nextX = player.position[0] + stepX;
        let nextZ = player.position[2] + stepZ;
        if (movement?.mode === "grid") {
          const snapped = snapPositionToGrid(nextX, nextZ, movement.cellSize ?? 1);
          nextX = snapped[0];
          nextZ = snapped[1];
        }
        let nextY = ground.sampleHeight(nextX, nextZ) + motion.jumpOffset;
        if (motionBatch !== null && motionBatch.y !== null) {
          nextY = motionBatch.y;
          motion.jumpOffset = motionBatch.y - ground.sampleHeight(nextX, nextZ);
        }
        if (movement?.beforeCommit !== undefined) {
          const frame: MovementCommitFrame = {
            entityId: playerId,
            current: player.position,
            next: [nextX, nextY, nextZ],
            dt: rawDt,
          };
          const replacement = movement.beforeCommit(frame);
          if (replacement !== undefined) {
            nextX = replacement[0];
            nextY = replacement[1];
            nextZ = replacement[2];
          }
        }
        ctx.scene.entity.setPose(playerId, {
          position: [nextX, nextY, nextZ],
          rotationY: intent.moving
            ? Math.atan2(motion.horizontalVelocityX, motion.horizontalVelocityZ)
            : player.rotationY,
          dt: rawDt,
        });
      }
      endPhase();
    }

    if (autoPickupRadius !== null) {
      endPhase = devtools.profile.begin("pickup");
      const self = ctx.scene.entity.get(playerId);
      if (self !== null) {
        const nearest = ctx.scene.worldItem.nearestInRadius(self.position, autoPickupRadius);
        if (nearest !== null) ctx.scene.worldItem.pickup(nearest, ctx.player.userId);
      }
      endPhase();
    }

    devtools.profile.measure("onTick", () => {
      playable.loop.onTick(ctx, gameDt);
    });

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
        ctx.game.commands.run(pingCommand, {
          point: hit.point,
          entity: hit.entity,
          object: hit.object,
          normal: hit.normal,
        });
      }
    }
    const aimOverride = pointerAim ? pointerAimFor(ctx, pointerService) : undefined;
    const commandAim: Aim = aimOverride ?? { yaw: yawRef.current, pitch: pitchRef.current };
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
            ctx.game.commands.run(active.prompt.invoke.name, active.prompt.invoke.input);
          }
        }
        continue;
      }
      if (!shouldFireBoundAction(tracker, action, playable.game.input, repeatFiredAtRef.current, nowMs)) continue;
      repeatFiredAtRef.current.set(action, nowMs);
      dispatchBoundAction(ctx, action, yawRef.current, pitchRef.current, commandAim);
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
  onRuntimeError,
}: {
  ctx: GameContext;
  playable: PlayableGame;
  tracker: ActionStateTracker<string>;
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
      const rawDt = (now - last) / 1000;
      const simStart = performance.now();
      try {
        let endPhase = devtools.profile.begin("time+input");
        const dt = Math.min(rawDt, 0.05);
        const gameDt = ctx.time.advance(dt);
        ctx.input.publish(heldActionsFor(tracker, inputActions));
        endPhase();
        devtools.profile.measure("onTick", () => {
          playable.loop.onTick(ctx, gameDt);
        });
        endPhase = devtools.profile.begin("actions");
        const nowMs = performance.now();
        for (const action of inputActions) {
          if (!shouldFireBoundAction(tracker, action, playable.game.input, repeatFiredAtRef.current, nowMs)) continue;
          repeatFiredAtRef.current.set(action, nowMs);
          dispatchBoundAction(ctx, action, 0, 0, { yaw: 0, pitch: 0 });
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
  }, [ctx, playable, tracker, onRuntimeError, inputActions]);

  return null;
}

class GameUiErrorBoundary extends Component<
  { children: ReactNode; onRuntimeError: (error: unknown, phase: string) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onRuntimeError(error, "ui-render");
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function DiagnosticOverlay({ diagnostics }: { diagnostics: RuntimeDiagnostic[] }) {
  if (diagnostics.length === 0) return null;
  const latest = diagnostics[diagnostics.length - 1]!;
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-50 max-w-lg rounded border border-red-400/60 bg-red-950/95 p-3 text-xs text-red-50 shadow-2xl">
      <div className="mb-1 font-semibold uppercase tracking-wide text-red-200">JG engine error</div>
      <div className="font-mono text-[11px] text-red-100">
        [{latest.phase}] {latest.message}
      </div>
      {latest.stack !== undefined ? (
        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-[10px] text-red-200/80">
          {latest.stack}
        </pre>
      ) : null}
    </div>
  );
}

const POSTER_SETTLE_SECONDS = 1.6;

export function GamePlayerShell({
  playable,
  multiplayer: rawMultiplayer = null,
  poster = false,
}: {
  playable: PlayableGame;
  multiplayer?: ShellMultiplayer | null;
  poster?: boolean;
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
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const f2HeldRef = useRef(false);
  const f2ChordedRef = useRef(false);
  const pointerService = useMemo(() => createPointerService(), []);
  const selection = useMemo(() => createSelectionSet(), [playable]);
  const [marquee, setMarquee] = useState<ScreenRect | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{ menu: ContextMenu; x: number; y: number } | null>(null);
  const tracker = useMemo(
    () => createActionStateTracker(toActionStateBindingMap(withTouchCodes(playable.game.input))),
    [playable],
  );
  const touchScheme = useMemo(
    () =>
      deriveTouchScheme(playable.game.input, {
        reserved: RESERVED_INPUT_ACTIONS,
        firstPerson: resolveRigKind(playable.camera) === "first",
        config: playable.touch,
      }),
    [playable],
  );
  const { coarsePointer, portrait } = useDisplayProfile();
  const touchSink = useMemo(
    () => ({ onCodeDown: (code: string) => tracker.handleDown(code), onCodeUp: (code: string) => tracker.handleUp(code) }),
    [tracker],
  );
  const audioEngine = useMemo(
    () => createAudioEngine({ sounds: playable.audio?.sounds, buses: playable.audio?.buses }),
    [playable],
  );
  useEffect(() => () => audioEngine.dispose(), [audioEngine]);
  const userId = multiplayer?.userId ?? DEV_USER_ID;
  const reportRuntimeError = (error: unknown, phase: string) => {
    const diagnostic = logRuntimeError(error, phase);
    setDiagnostics((current) => [...current.slice(-4), { ...diagnostic, id: Date.now() + current.length }]);
  };

  useEffect(() => {
    playable.game.scene.clear();
    setDiagnostics([]);
    try {
      const context = createGameContext({
        definition: playable.game,
        content: playable.content,
        player: { userId, isNew: true },
      });
      playable.loop.onInit(context);
      playable.loop.onNewPlayer(context);
      setCtx(context);
    } catch (error) {
      reportRuntimeError(error, "init");
      setCtx(null);
    }
    return () => {
      playable.game.scene.clear();
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
        if (chatSync !== undefined) {
          const globalChannelIds = new Set(
            ctx.game.chat
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
                  ctx.game.chat.send(message.fromUserId, message.channelId, message.body);
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
  }, [ctx, multiplayer]);

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
          tracker.handleDown(event.code);
        }}
        onKeyUp={(event) => {
          if (event.code === "F2" && devtoolsEnabled) {
            f2HeldRef.current = false;
            if (!f2ChordedRef.current) setDevtoolsOpen((current) => !current);
            return;
          }
          tracker.handleUp(event.code);
        }}
        onBlur={() => {
          f2HeldRef.current = false;
          tracker.reset();
        }}
      >
        <HudOnlyDriver ctx={ctx} playable={playable} tracker={tracker} onRuntimeError={reportRuntimeError} />
        <GameUiErrorBoundary onRuntimeError={reportRuntimeError}>
          <GameProvider context={ctx}>
            <GameUI />
          </GameProvider>
        </GameUiErrorBoundary>
        {devtoolsEnabled ? (
          <DevtoolsOverlay open={devtoolsOpen} ctx={ctx} playable={playable} multiplayer={multiplayer} />
        ) : null}
        <DiagnosticOverlay diagnostics={diagnostics} />
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
  const resolveEntityRole = (entity: SceneEntity) => playable.content.entityById?.(entity.name)?.role;

  const pointer: PointerConfig | undefined = playable.pointer;
  const pointerUsesLeft = pointer !== undefined && (pointer.select === true || pointer.moveCommand !== undefined);
  const selectFilter = pointer?.selectFilter;
  const worldSky = resolveWorldSky(playable.game.world);
  const world = playable.game.world;
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

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    wrapperRef.current?.focus();
    audioEngine.resume();
    if (contextMenu !== null) setContextMenu(null);
    if (event.button === 0) {
      const point = localXY(event);
      pointerDownRef.current = point;
      if (pointer?.select === true) marqueeStartRef.current = point;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const dockMounted =
    !poster &&
    coarsePointer &&
    touchScheme !== null &&
    (touchScheme.joystick !== null || touchScheme.buttons.length > 0);
  const orientationMismatch =
    !poster &&
    coarsePointer &&
    playable.orientation !== undefined &&
    (playable.orientation === "landscape") === portrait;

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      {...(poster && posterFrozen ? { "data-poster-ready": "" } : {})}
      className="relative h-full w-full bg-neutral-950 outline-none"
      style={
        {
          "--jg-hud-dock-clearance": `${dockMounted ? touchDockClearance(touchScheme) : 0}px`,
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
        tracker.handleDown(event.code);
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
        tracker.handleUp(event.code);
      }}
      onBlur={() => {
        f2HeldRef.current = false;
        tracker.reset();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
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
        shadows={playable.shadows ?? true}
        gl={{ preserveDrawingBuffer: true }}
        style={{ touchAction: "none" }}
      >
        {backgroundColor !== undefined ? <color attach="background" args={[backgroundColor]} /> : null}
        {effectiveSky === undefined ? (
          lighting !== undefined ? (
            <ConfiguredLighting lighting={lighting} />
          ) : (
            <>
              <ambientLight intensity={0.55} />
              <directionalLight position={[10, 16, 6]} intensity={1.3} />
            </>
          )
        ) : effectiveSky.timeOfDay ? (
          <TimeOfDayDaylight sky={effectiveSky} clock={ctx.time} />
        ) : backdropSky !== undefined ? (
          <SkyDaylight sky={backdropSky} />
        ) : null}
        <BackdropFog fog={backdrop?.fog} />
        <GameProvider context={ctx}>
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
          />
          {WorldOverlay !== undefined ? <WorldOverlay /> : null}
          {barsStatId !== null ? (
            <WorldEntityBars statId={barsStatId} roles={barsRoles} resolveRole={resolveEntityRole} />
          ) : null}
          <WorldItems config={playable.worldItem} />
          <WorldTelegraphs />
          <WorldFloatText />
          <ProjectileTracers />
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
      </Canvas>
      {!poster && coarsePointer && touchScheme !== null && (touchScheme.gestures !== null || touchScheme.look) ? (
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
          <GameUI />
        </GameProvider>
      </GameUiErrorBoundary>
      {!poster && showReticle ? <Reticle /> : null}
      {dockMounted && touchScheme !== null ? <TouchControlsDock scheme={touchScheme} sink={touchSink} /> : null}
      {orientationMismatch && playable.orientation !== undefined ? (
        <OrientationHint wanted={playable.orientation} />
      ) : null}
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
      {poster ? null : <DiagnosticOverlay diagnostics={diagnostics} />}
    </div>
  );
}
