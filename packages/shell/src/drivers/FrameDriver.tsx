import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";

import { RESERVED_INPUT_ACTIONS, dispatchBoundAction, heldActionsFor, shouldFireBoundAction } from "../boundActionDispatch";
import { executeHotbarSlot, findHotbarSlotActions, hotbarIdFor } from "../hotbarActions";
import { pointerAimFor } from "../shellPointer";
import { shellDrivesPlayerPose } from "../shellMovement";
import type { Aim } from "@jgengine/core/scene/spatial";
import { steerYaw } from "@jgengine/core/movement/steering";
import { stepPlayerMovement, resolvePlayerMovementTuning } from "@jgengine/core/movement/playerMovement";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { isServerAuthoritative } from "@jgengine/core/runtime/adapter";
import { resolveCommandSink, type CommandSink } from "../commandSink";
import { inputFramesEqual, resolveInputSink, type InputSink } from "../inputSink";
import type { InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import { advanceBehaviors } from "@jgengine/core/scene/behaviorRuntime";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { PointerAxisState } from "@jgengine/core/input/pointerAxis";
import { DEFAULT_PICKUP_RADIUS } from "@jgengine/core/game/worldItem";
import { playControlsActive } from "@jgengine/core/game/controlGate";
import { devtools } from "@jgengine/core/devtools/devtools";
import type { ActionStateTracker } from "@jgengine/core/input/actionBindings";

import { collisionDebug } from "../devtools/collisionDebug";
import { GAME_SIM_FRAME_PRIORITY } from "../camera";
import { NO_ACTIONS } from "../shellConstants";
import type { PointerService } from "../pointer/pointerService";
import type { ShellMultiplayer } from "../multiplayer";
import type { PlayableGame } from "../registry";

const TURN_SPEED = 2.4;

export const POSTER_SETTLE_SECONDS = 1.6;

export function FrameDriver({
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
      advanceBehaviors(ctx, gameDt);
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
