import { useEffect, useMemo, useRef } from "react";

import { dispatchBoundAction, heldActionsFor, shouldFireBoundAction } from "../boundActionDispatch";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { advanceBehaviors } from "@jgengine/core/scene/behaviorRuntime";
import type { PointerAxisState } from "@jgengine/core/input/pointerAxis";
import { playControlsActive } from "@jgengine/core/game/controlGate";
import { devtools } from "@jgengine/core/devtools/devtools";
import type { ActionStateTracker } from "@jgengine/core/input/actionBindings";

import { EMPTY_RESERVED, NO_ACTIONS } from "../shellConstants";
import type { PlayableGame } from "../registry";

export function HudOnlyDriver({
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
        advanceBehaviors(ctx, gameDt);
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
