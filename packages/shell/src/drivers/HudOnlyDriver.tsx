import { useEffect, useMemo, useRef } from "react";

import { dispatchBoundAction, heldActionsFor, shouldFireBoundAction } from "../boundActionDispatch";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { advanceBehaviors } from "@jgengine/core/scene/behaviorRuntime";
import type { PointerAxisState } from "@jgengine/core/input/pointerAxis";
import { playControlsActive } from "@jgengine/core/game/controlGate";
import { devtools } from "@jgengine/core/devtools/devtools";
import type { ActionStateTracker } from "@jgengine/core/input/actionBindings";
import { isServerAuthoritative } from "@jgengine/core/runtime/adapter";
import type { InputFrame } from "@jgengine/core/runtime/hostedGameRunner";
import { resolveCommandSink } from "../commandSink";
import { inputFramesEqual, resolveInputSink } from "../inputSink";
import type { ShellMultiplayer } from "../multiplayer";

import { EMPTY_RESERVED, NO_ACTIONS } from "../shellConstants";
import type { PlayableGame } from "../registry";

export function HudOnlyDriver({
  ctx,
  multiplayer,
  serverIdRef,
  playable,
  tracker,
  pointerAxisRef,
  gateRef,
  onRuntimeError,
}: {
  ctx: GameContext;
  multiplayer: ShellMultiplayer | null;
  serverIdRef: { current: string | null };
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
  const lastSentInputRef = useRef<InputFrame | null>(null);
  const serverAuthoritative = isServerAuthoritative(playable.game.multiplayer) && multiplayer !== null;

  useEffect(() => {
    let frameId: number;
    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      const last = lastFrameRef.current;
      lastFrameRef.current = now;
      if (last === null) return;
      const sendInput = () => {
        if (!serverAuthoritative || serverIdRef.current === null) return;
        const frame: InputFrame = { held: ctx.input.held(), pointer: ctx.input.pointer(), analog: ctx.input.analog() };
        if (lastSentInputRef.current !== null && inputFramesEqual(lastSentInputRef.current, frame)) return;
        lastSentInputRef.current = frame;
        resolveInputSink({ serverAuthoritative, backend: multiplayer?.backend ?? null, serverId: serverIdRef.current }).send(frame);
      };
      if (gateRef.current || !playControlsActive(ctx)) {
        ctx.input.publish(heldActionsFor(tracker, NO_ACTIONS), { reset: true });
        ctx.input.publishAnalog(null);
        sendInput();
        return;
      }
      const rawDt = (now - last) / 1000;
      const simStart = performance.now();
      try {
        let endPhase = devtools.profile.begin("time+input");
        const dt = Math.min(rawDt, 0.05);
        ctx.input.publish(heldActionsFor(tracker, tracker.actions()), {});
        ctx.input.publishPointer(pointerAxisRef.current);
        sendInput();
        endPhase();
        if (!serverAuthoritative) ctx.sim.advance(dt, (stepDt, _tick, gameDt) => {
          ctx.input.beginStep();
          ctx.sim.runStages("beforeMovement", stepDt);
          ctx.sim.runStages("afterMovement", stepDt);
          devtools.profile.measure("onTick", () => {
            playable.loop.onTick(ctx, gameDt);
          });
          advanceBehaviors(ctx, gameDt);
          ctx.sim.runStages("afterTick", stepDt);
        });
        endPhase = devtools.profile.begin("actions");
        const nowMs = performance.now();
        for (const action of inputActions) {
          if (!shouldFireBoundAction(tracker, action, playable.game.input, repeatFiredAtRef.current, nowMs)) continue;
          repeatFiredAtRef.current.set(action, nowMs);
          dispatchBoundAction(ctx, action, 0, 0, { yaw: 0, pitch: 0 }, EMPTY_RESERVED,
            resolveCommandSink(ctx, { serverAuthoritative, backend: multiplayer?.backend ?? null, serverId: serverIdRef.current }));
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
  }, [ctx, playable, tracker, pointerAxisRef, gateRef, onRuntimeError, inputActions, multiplayer, serverIdRef, serverAuthoritative]);

  return null;
}
