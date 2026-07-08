import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  actionRepeatIntervals,
  createActionRepeater,
  createActionStateTracker,
  hotbarSlotActionIndex,
  resolveActionCommand,
  toActionStateBindingMap,
  type ActionStateTracker,
} from "@jgengine/core/input/actionBindings";
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
  applyMotionCommand,
  createEmptyMovementKeys,
  createPlayerMotionState,
  resolveMovementIntent,
} from "@jgengine/core/movement/movementModel";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { DEFAULT_PICKUP_RADIUS, WORLD_ITEM_ENTITY_NAME } from "@jgengine/core/game/worldItem";
import { useGameContext } from "@jgengine/react/provider";
import { useSceneEntities, useSceneObjects, usePlayer, useTarget } from "@jgengine/react/hooks";
import { GameProvider } from "@jgengine/react/provider";
import type { WsPresenceRow } from "@jgengine/ws/protocol";

import type {
  EntitySpriteConfig,
  ModelConfig,
  ObjectStyle,
  PointerConfig,
  ProposedMovement,
} from "@jgengine/core/game/playableGame";

import { AudioListener, EntityAudioEmitters, ObjectAudioEmitters } from "./audio/AudioComponents";
import { createAudioEngine } from "./audio/audioEngine";
import { GAME_SIM_FRAME_PRIORITY, GameCameraRig, resolveRigKind } from "./camera";
import { PointerProbe } from "./pointer/PointerProbe";
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
import { WorldItems } from "./world/WorldItems";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";

const DEV_USER_ID = "dev-player";
const TURN_SPEED = 2.4;
const PRIMARY_CLICK_MOVE_THRESHOLD_PX = 6;
const GROUND_SIZE = 160;
const GROUND_SEGMENTS = 80;

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

function colorFromId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return `hsl(${hash % 360}, 65%, 55%)`;
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

function EntityModel({ model }: { model: ModelConfig }) {
  const gltf = useLoader(GLTFLoader, model.url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  const scale = model.scale ?? 1;
  const baseY = model.y ?? 0;
  const dims = model.dims;
  const centered = (model.anchor ?? "center") === "center" && dims !== undefined;
  const position: [number, number, number] = centered
    ? [-scale * dims!.center.x, baseY - scale * dims!.minY, -scale * dims!.center.z]
    : [0, baseY, 0];
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
        <EntityModel model={model} />
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
  return (
    <group
      position={[object.position[0], object.position[1], object.position[2]]}
      rotation-y={object.rotationY}
      userData={{ [POINTER_OBJECT_KEY]: object.instanceId }}
    >
      {custom !== undefined && custom !== null ? (
        custom
      ) : model !== undefined ? (
        <EntityModel model={model} />
      ) : style?.hidden === true ? null : (
        <mesh position-y={0.5}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={style?.color ?? colorFromId(object.catalogId)}
            transparent={style?.opacity !== undefined && style.opacity < 1}
            opacity={style?.opacity ?? 1}
          />
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

function RemotePlayers({ rows }: { rows: WsPresenceRow[] }) {
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
}) {
  const motionRef = useRef(createPlayerMotionState());
  const hasReportedTickError = useRef(false);
  const slotActions = useMemo(() => findHotbarSlotActions(playable.game.input), [playable]);
  const hotbarId = useMemo(() => hotbarIdFor(playable), [playable]);
  const declaredActions = useMemo(() => Object.keys(playable.game.input ?? {}), [playable]);
  const repeatIntervals = useMemo(() => actionRepeatIntervals(playable.game.input ?? {}), [playable]);
  const actionRepeater = useMemo(() => createActionRepeater(repeatIntervals), [repeatIntervals]);

  useFrame((_state, rawDt) => {
    try {
    const dt = Math.min(rawDt, 0.05);
    const gameDt = ctx.time.advance(dt);
    if (tracker.isDown("turnLeft")) yawRef.current += TURN_SPEED * dt;
    if (tracker.isDown("turnRight")) yawRef.current -= TURN_SPEED * dt;

    const heldActions = new Set<string>();
    for (const action of declaredActions) if (tracker.isDown(action)) heldActions.add(action);
    ctx.input.publish({
      held: heldActions,
      forward: (tracker.isDown("moveForward") ? 1 : 0) - (tracker.isDown("moveBack") ? 1 : 0),
      right: (tracker.isDown("moveRight") ? 1 : 0) - (tracker.isDown("moveLeft") ? 1 : 0),
      jump: tracker.isDown("jump"),
      sprint: tracker.isDown("sprint"),
      yaw: yawRef.current,
      pitch: pitchRef.current,
      pointerLocked: document.pointerLockElement !== null,
    });

    const playerId = ctx.player.possession.active(ctx.player.userId);
    const player = ctx.scene.entity.get(playerId);
    const forwardX = Math.sin(yawRef.current);
    const forwardZ = Math.cos(yawRef.current);
    if (player !== null) {
      const motion = motionRef.current;
      if (motion.y !== player.position[1]) motion.y = player.position[1];
      for (const command of ctx.player.motion.drain()) applyMotionCommand(motion, command);

      const keys = createEmptyMovementKeys();
      keys.w = tracker.isDown("moveForward");
      keys.s = tracker.isDown("moveBack");
      keys.a = tracker.isDown("moveLeft");
      keys.d = tracker.isDown("moveRight");
      keys.shift = tracker.isDown("sprint");
      keys.space = tracker.isDown("jump");
      const intent = resolveMovementIntent(keys, true);
      const physics = playable.game.physics;
      const groundY =
        playable.movement?.groundHeight?.(player.position[0], player.position[2], player.position[1]) ?? 0;
      const step = advancePlayerMotion(
        motion,
        intent,
        forwardX,
        forwardZ,
        player.movement.walkSpeed ?? 2,
        rawDt,
        {
          groundY,
          ...(physics?.gravity !== undefined ? { gravity: Math.abs(physics.gravity) } : {}),
          ...(physics?.jumpVelocity !== undefined ? { jumpVelocity: physics.jumpVelocity } : {}),
        },
      );

      let proposed: ProposedMovement = {
        position: [player.position[0] + step.stepX, step.y, player.position[2] + step.stepZ],
        rotationY: intent.moving
          ? Math.atan2(motion.horizontalVelocityX, motion.horizontalVelocityZ)
          : player.rotationY,
        grounded: motion.grounded,
      };

      const lockAxis = playable.movement?.lockAxis;
      if (lockAxis === "x") {
        proposed = { ...proposed, position: [player.position[0], proposed.position[1], proposed.position[2]] };
      } else if (lockAxis === "z") {
        proposed = { ...proposed, position: [proposed.position[0], proposed.position[1], player.position[2]] };
      }

      const constrain = playable.movement?.constrain;
      const finalPose = constrain === undefined ? proposed : constrain(proposed, player);
      if (finalPose !== null) {
        if (finalPose !== proposed) motion.y = finalPose.position[1];
        ctx.scene.entity.setPose(playerId, {
          position: finalPose.position,
          rotationY: finalPose.rotationY,
          dt: rawDt,
        });
      }
    }

    playable.loop.onTick(ctx, gameDt);

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
    const nowMs = performance.now();
    for (const action of declaredActions) {
      const due =
        repeatIntervals[action] === undefined
          ? tracker.wasPressed(action)
          : actionRepeater.due(action, tracker.isDown(action), tracker.wasPressed(action), nowMs);
      if (!due) continue;
      if (action === "ping" && pingCommand !== undefined) continue;
      if (action === "interact") {
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
      const command = resolveActionCommand(
        action,
        (name) => ctx.game.commands.has(name),
        RESERVED_INPUT_ACTIONS,
      );
      if (command !== null) {
        ctx.game.commands.run(command, { aim: { yaw: yawRef.current, pitch: pitchRef.current } });
      }
    }
    if (hotbarId !== null) {
      const aimOverride = pointerAim ? pointerAimFor(ctx, pointerService) : undefined;
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

    const serverId = serverIdRef.current;
    if (multiplayer !== null && serverId !== null) {
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
    }
    } catch (error) {
      if (!hasReportedTickError.current) {
        hasReportedTickError.current = true;
        onRuntimeError(error, "tick");
      }
    }
  }, GAME_SIM_FRAME_PRIORITY);
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

export function GamePlayerShell({
  playable,
  multiplayer = null,
}: {
  playable: PlayableGame;
  multiplayer?: ShellMultiplayer | null;
}) {
  const [ctx, setCtx] = useState<GameContext | null>(null);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostic[]>([]);
  const [remotePlayers, setRemotePlayers] = useState<WsPresenceRow[]>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const serverIdRef = useRef<string | null>(null);
  const cameraDraggingRef = useRef(false);
  const primaryClickRef = useRef(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const secondaryDownRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerService = useMemo(() => createPointerService(), []);
  const selection = useMemo(() => createSelectionSet(), [playable]);
  const [marquee, setMarquee] = useState<ScreenRect | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{ menu: ContextMenu; x: number; y: number } | null>(null);
  const tracker = useMemo(
    () => createActionStateTracker(toActionStateBindingMap(playable.game.input ?? {})),
    [playable],
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
  const firstPerson = rigKind === "first";
  const showReticle =
    (firstPerson && playable.camera?.firstPerson?.reticle !== false) || rigKind === "shoulder";
  const worldBars = playable.worldHealthBars;
  const barsStatId =
    worldBars === undefined || worldBars === false
      ? null
      : worldBars === true
        ? "health"
        : worldBars.statId ?? "health";

  const pointer: PointerConfig | undefined = playable.pointer;
  const pointerUsesLeft = pointer !== undefined && (pointer.select === true || pointer.moveCommand !== undefined);
  const selectFilter = pointer?.selectFilter;

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
    if (event.button === 2 && pointer?.secondaryCommand !== undefined) {
      secondaryDownRef.current = localXY(event);
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
    if (event.button === 2) {
      const start = secondaryDownRef.current;
      secondaryDownRef.current = null;
      const secondaryCommand = pointer?.secondaryCommand;
      if (secondaryCommand === undefined || start === null || cameraDraggingRef.current) return;
      const end = localXY(event);
      const moved = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
      if (moved > PRIMARY_CLICK_MOVE_THRESHOLD_PX * PRIMARY_CLICK_MOVE_THRESHOLD_PX) return;
      const hit = pointerService.worldHit();
      if (hit !== null && ctx.game.commands.has(secondaryCommand)) {
        ctx.game.commands.run(secondaryCommand, {
          point: hit.point,
          entity: hit.entity,
          object: hit.object,
          normal: hit.normal,
          aim: { yaw: yawRef.current, pitch: pitchRef.current },
        });
      }
      return;
    }
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
    }
  };

  const handleVerbPick = (verb: ContextVerb) => {
    const state = contextMenu;
    setContextMenu(null);
    if (state !== null && ctx.game.commands.has(verb.command)) {
      ctx.game.commands.run(verb.command, contextVerbInput(state.menu, verb));
    }
  };

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      className="relative h-full w-full bg-neutral-950 outline-none"
      onKeyDown={(event) => {
        if (event.code === "Tab" || event.code === "Space") event.preventDefault();
        tracker.handleDown(event.code);
      }}
      onKeyUp={(event) => tracker.handleUp(event.code)}
      onBlur={() => tracker.reset()}
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
      <Canvas camera={{ fov: 55, near: 0.1, far: 300 }}>
        <color attach="background" args={["#14161b"]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[10, 16, 6]} intensity={1.3} />
        <GameProvider context={ctx}>
          <WorldView
            entitySprites={playable.entitySprites}
            entityModels={playable.entityModels}
            objectModels={playable.objectModels}
            objectStyles={playable.objectStyles}
            environment={playable.environment}
            assets={playable.game.assets}
            renderEntity={playable.renderEntity}
            renderObject={playable.renderObject}
            selectedIds={selectedIds}
          />
          {WorldOverlay !== undefined ? <WorldOverlay /> : null}
          {barsStatId !== null ? <WorldEntityBars statId={barsStatId} /> : null}
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
        />
      </Canvas>
      <GameUiErrorBoundary onRuntimeError={reportRuntimeError}>
        <GameProvider context={ctx}>
          <GameUI />
        </GameProvider>
      </GameUiErrorBoundary>
      {showReticle ? <Reticle /> : null}
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
      <DiagnosticOverlay diagnostics={diagnostics} />
    </div>
  );
}
