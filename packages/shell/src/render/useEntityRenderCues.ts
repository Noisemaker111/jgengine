import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import {
  advanceMotionCues,
  applyRenderAnimationEvent,
  applyRenderDeathEvent,
  applyRenderHitEvent,
  DEFAULT_FIRE_PULSE_SECONDS,
  DEFAULT_HIT_PULSE_SECONDS,
  DEFAULT_RENDER_CUES,
  type EntityRenderCues,
  type RenderCueTuning,
} from "@jgengine/core/combat/renderCues";
import { groundSpeed } from "@jgengine/core/scene/entityStore";
import { useGameContext } from "@jgengine/react/provider";

/**
 * Live motion + animation cues for one entity, read from a mutable ref inside
 * your own `useFrame` — no re-render per frame, no diffing the parent group's
 * position, no game-side module map for attack/hit timing. Backs both custom
 * `renderEntity` rigs and a custom first-person viewmodel (#542): call it with
 * `entity.id` / the local player's userId and drive bob/recoil/reload poses
 * from `cuesRef.current` inside the calling component's own `useFrame`.
 *
 * @capability entity-render-cues live velocity/bob/fire/reload/hit/death cues for a custom renderEntity or viewmodel component
 */
export function useEntityRenderCues(
  instanceId: string | undefined,
  tuning?: RenderCueTuning,
): MutableRefObject<EntityRenderCues> {
  const ctx = useGameContext();
  const cuesRef = useRef<EntityRenderCues>({ ...DEFAULT_RENDER_CUES });
  const timersRef = useRef({ fire: 0, hit: 0 });

  useEffect(() => {
    cuesRef.current = { ...DEFAULT_RENDER_CUES };
    timersRef.current = { fire: 0, hit: 0 };
    if (instanceId === undefined) return;
    const offAnimation = ctx.game.events.on("entity.animation", (event) => {
      if (event.instanceId !== instanceId) return;
      cuesRef.current = applyRenderAnimationEvent(cuesRef.current, event.event);
      if (event.event === "fire") timersRef.current.fire = tuning?.firePulseSeconds ?? DEFAULT_FIRE_PULSE_SECONDS;
    });
    const offHit = ctx.game.events.on("combat.hitReaction", (event) => {
      if (event.instanceId !== instanceId) return;
      cuesRef.current = applyRenderHitEvent(cuesRef.current);
      timersRef.current.hit = tuning?.hitPulseSeconds ?? DEFAULT_HIT_PULSE_SECONDS;
    });
    const offDied = ctx.game.events.on("entity.died", (event) => {
      if (event.instanceId !== instanceId) return;
      cuesRef.current = applyRenderDeathEvent(cuesRef.current);
    });
    return () => {
      offAnimation();
      offHit();
      offDied();
    };
  }, [ctx, instanceId, tuning?.firePulseSeconds, tuning?.hitPulseSeconds]);

  useFrame((_state, delta) => {
    if (instanceId === undefined || delta <= 0) return;
    const entity = ctx.scene.entity.get(instanceId);
    if (entity === null) return;
    const timers = timersRef.current;
    timers.fire = Math.max(0, timers.fire - delta);
    timers.hit = Math.max(0, timers.hit - delta);
    const advanced = advanceMotionCues(cuesRef.current, groundSpeed(entity), delta, tuning);
    cuesRef.current = { ...advanced, firing: timers.fire > 0, hit: timers.hit > 0 };
  });

  return cuesRef;
}
