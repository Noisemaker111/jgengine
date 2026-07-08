import { useEffect, useMemo, useRef } from "react";

import {
  actionRepeatIntervals,
  createActionRepeater,
  type ActionStateTracker,
} from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { dispatchFrameActions, findHotbarSlotActions, hotbarIdFor } from "./gameFrameDispatch";
import type { ShellMultiplayer } from "./multiplayer";
import type { PlayableGame } from "./registry";

export function HudFrameDriver({
  ctx,
  playable,
  tracker,
  onRuntimeError,
  multiplayer,
  serverIdRef,
}: {
  ctx: GameContext;
  playable: PlayableGame;
  tracker: ActionStateTracker<string>;
  onRuntimeError: (error: unknown, phase: string) => void;
  multiplayer: ShellMultiplayer | null;
  serverIdRef: { current: string | null };
}) {
  const hasReportedTickError = useRef(false);
  const slotActions = useMemo(() => findHotbarSlotActions(playable.game.input), [playable]);
  const hotbarId = useMemo(() => hotbarIdFor(playable), [playable]);
  const declaredActions = useMemo(() => Object.keys(playable.game.input ?? {}), [playable]);
  const repeatIntervals = useMemo(() => actionRepeatIntervals(playable.game.input ?? {}), [playable]);
  const actionRepeater = useMemo(() => createActionRepeater(repeatIntervals), [repeatIntervals]);

  useEffect(() => {
    let frame = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      try {
        const dt = Math.min(rawDt, 0.05);
        const gameDt = ctx.time.advance(dt);

        const heldActions = new Set<string>();
        for (const action of declaredActions) if (tracker.isDown(action)) heldActions.add(action);
        ctx.input.publish({
          held: heldActions,
          forward: (tracker.isDown("moveForward") ? 1 : 0) - (tracker.isDown("moveBack") ? 1 : 0),
          right: (tracker.isDown("moveRight") ? 1 : 0) - (tracker.isDown("moveLeft") ? 1 : 0),
          jump: tracker.isDown("jump"),
          sprint: tracker.isDown("sprint"),
          yaw: 0,
          pitch: 0,
          pointerLocked: false,
        });

        const playerId = ctx.player.possession.active(ctx.player.userId);

        playable.loop.onTick(ctx, gameDt);

        dispatchFrameActions({
          ctx,
          playable,
          tracker,
          playerId,
          declaredActions,
          repeatIntervals,
          actionRepeater,
          slotActions,
          hotbarId,
          aim: { yaw: 0, pitch: 0 },
          pingCommand: undefined,
          pointerService: null,
          pointerAim: false,
        });

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
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    ctx,
    playable,
    tracker,
    onRuntimeError,
    multiplayer,
    serverIdRef,
    declaredActions,
    repeatIntervals,
    actionRepeater,
    slotActions,
    hotbarId,
  ]);

  return null;
}
