import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

import {
  createActionStateTracker,
  hotbarSlotActionIndex,
  resolveActionCommand,
  toActionStateBindingMap,
  type ActionStateTracker,
} from "@jgengine/core/input/actionBindings";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import {
  advancePlayerMotion,
  createEmptyMovementKeys,
  createPlayerMotionState,
  resolveMovementIntent,
} from "@jgengine/core/movement/movementModel";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useGameContext } from "@jgengine/react/provider";
import { useSceneEntities, useSceneObjects, usePlayer, useTarget } from "@jgengine/react/hooks";
import { GameProvider } from "@jgengine/react/provider";
import type { WsPresenceRow } from "@jgengine/ws/protocol";

import type { EntitySpriteConfig } from "@jgengine/core/game/playableGame";

import { GAME_SIM_FRAME_PRIORITY, GameOrbitCamera } from "./camera";
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
  hotbarId: string,
  slot: number,
  yaw: number,
  pitch: number,
): { ok: boolean; error?: string } {
  const stack = ctx.player.inventory.state(hotbarId).slots[slot];
  if (stack === undefined || stack === null) return { ok: false, error: `Hotbar slot ${slot + 1} is empty` };
  const result = ctx.item.use.use({
    from: ctx.player.userId,
    itemId: stack.itemId,
    inventoryId: hotbarId,
    aim: { yaw, pitch },
  });
  return result.error === undefined ? { ok: true } : { ok: false, error: result.error };
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

function EntityMarker({
  entity,
  sprite,
  isLocal,
  targeted,
  onSelect,
}: {
  entity: SceneEntity;
  sprite: EntitySpriteConfig | undefined;
  isLocal: boolean;
  targeted: boolean;
  onSelect: (entity: SceneEntity) => void;
}) {
  const color = isLocal ? "#4ade80" : entity.role === "npc" ? colorFromId(entity.name) : "#9ca3af";
  return (
    <group
      position={[entity.position[0], entity.position[1], entity.position[2]]}
      rotation-y={entity.rotationY}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!isLocal) onSelect(entity);
      }}
    >
      {sprite !== undefined ? (
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

function WorldView({ entitySprites }: { entitySprites: Record<string, EntitySpriteConfig> | undefined }) {
  const ctx = useGameContext();
  const entities = useSceneEntities();
  const objects = useSceneObjects();
  const player = usePlayer();
  const targetId = useTarget(player.userId);
  const handleSelect = (entity: SceneEntity) => {
    const relation = ctx.scene.entity.canReceive(entity.id, "damage") === null ? "hostile" : "friendly";
    ctx.scene.entity.setTarget(player.userId, relation === "hostile" || entity.role === "npc" ? entity.id : null);
  };
  return (
    <>
      <GroundPlane />
      <gridHelper args={[160, 80, "#3a3f4a", "#2b2f38"]} position-y={0.01} />
      <RockField />
      {entities.map((entity) => (
        <EntityMarker
          key={entity.id}
          entity={entity}
          sprite={entitySprites?.[entity.name]}
          isLocal={entity.id === player.userId}
          targeted={entity.id === targetId}
          onSelect={handleSelect}
        />
      ))}
      {objects.map((object) => (
        <mesh
          key={object.instanceId}
          position={[object.position[0], object.position[1] + 0.5, object.position[2]]}
          rotation-y={object.rotationY}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={colorFromId(object.catalogId)} />
        </mesh>
      ))}
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
}) {
  const motionRef = useRef(createPlayerMotionState());
  const hasReportedTickError = useRef(false);
  const slotActions = useMemo(() => findHotbarSlotActions(playable.game.input), [playable]);
  const hotbarId = useMemo(() => hotbarIdFor(playable), [playable]);

  useFrame((_state, rawDt) => {
    try {
    const dt = Math.min(rawDt, 0.05);
    if (tracker.isDown("turnLeft")) yawRef.current += TURN_SPEED * dt;
    if (tracker.isDown("turnRight")) yawRef.current -= TURN_SPEED * dt;

    const playerId = ctx.player.userId;
    const player = ctx.scene.entity.get(playerId);
    const forwardX = Math.sin(yawRef.current);
    const forwardZ = Math.cos(yawRef.current);
    if (player !== null) {
      const keys = createEmptyMovementKeys();
      keys.w = tracker.isDown("moveForward");
      keys.s = tracker.isDown("moveBack");
      keys.a = tracker.isDown("moveLeft");
      keys.d = tracker.isDown("moveRight");
      keys.shift = tracker.isDown("sprint");
      keys.space = tracker.isDown("jump");
      const intent = resolveMovementIntent(keys, true);
      const motion = motionRef.current;
      const step = advancePlayerMotion(
        motion,
        intent,
        forwardX,
        forwardZ,
        player.movement.walkSpeed ?? 2,
        rawDt,
      );
      ctx.scene.entity.setPose(playerId, {
        position: [player.position[0] + step.stepX, motion.jumpOffset, player.position[2] + step.stepZ],
        rotationY: intent.moving
          ? Math.atan2(motion.horizontalVelocityX, motion.horizontalVelocityZ)
          : player.rotationY,
      });
    }

    playable.loop.onTick(ctx, dt);

    if (tracker.wasPressed("tabTarget")) {
      if (ctx.game.commands.has("target.cycle")) ctx.game.commands.run("target.cycle", {});
      else ctx.scene.entity.cycleTarget(playerId, { filter: "hostile" });
    }
    if (tracker.wasPressed("clearTarget")) {
      if (ctx.game.commands.has("target.clear")) ctx.game.commands.run("target.clear", {});
      else ctx.scene.entity.setTarget(playerId, null);
    }
    for (const action of Object.keys(playable.game.input ?? {})) {
      if (!tracker.wasPressed(action)) continue;
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
      if (command !== null) ctx.game.commands.run(command, {});
    }
    if (hotbarId !== null) {
      for (const { action, slot } of slotActions) {
        if (!tracker.wasPressed(action)) continue;
        const result = executeHotbarSlot(ctx, hotbarId, slot, yawRef.current, pitchRef.current);
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
          const result = executeHotbarSlot(ctx, hotbarId, slot, yawRef.current, pitchRef.current);
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
          rotationPitch: 0,
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
  const tracker = useMemo(
    () => createActionStateTracker(toActionStateBindingMap(playable.game.input ?? {})),
    [playable],
  );
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

  if (ctx === null) return <div className="h-full w-full bg-neutral-950" />;

  const GameUI = playable.GameUI;
  const WorldOverlay = playable.WorldOverlay;
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
      onPointerDown={(event) => {
        wrapperRef.current?.focus();
        if (event.button === 0) {
          pointerDownRef.current = { x: event.clientX, y: event.clientY };
        }
      }}
      onPointerUp={(event) => {
        if (event.button !== 0 || pointerDownRef.current === null) return;
        const start = pointerDownRef.current;
        pointerDownRef.current = null;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        const moved = dx * dx + dy * dy;
        if (!cameraDraggingRef.current && moved <= PRIMARY_CLICK_MOVE_THRESHOLD_PX * PRIMARY_CLICK_MOVE_THRESHOLD_PX) {
          primaryClickRef.current = true;
        }
      }}
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
          <WorldView entitySprites={playable.entitySprites} />
          {WorldOverlay !== undefined ? <WorldOverlay /> : null}
          <GameOrbitCamera
            yawRef={yawRef}
            pitchRef={pitchRef}
            config={playable.camera}
            followEntityId={playable.camera?.followEntityId}
            onCameraFollow={playable.camera?.onCameraFollow}
            onDragChange={(dragging) => {
              cameraDraggingRef.current = dragging;
            }}
          />
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
        />
      </Canvas>
      <GameUiErrorBoundary onRuntimeError={reportRuntimeError}>
        <GameProvider context={ctx}>
          <GameUI />
        </GameProvider>
      </GameUiErrorBoundary>
      <DiagnosticOverlay diagnostics={diagnostics} />
    </div>
  );
}
