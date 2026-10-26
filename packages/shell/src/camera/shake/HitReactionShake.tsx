import { useEffect } from "react";

import { useGameContext } from "@jgengine/react/provider";

import { CALIBRATED_TRAUMA_DECAY_PER_SECOND, useCameraShake } from "./shakeChannel";

/** Feeds `combat.hitReaction` events into the active rig's camera shake: calibrated trauma, or a raw amplitude and decay. @internal */
export function HitReactionShake() {
  const ctx = useGameContext();
  const shake = useCameraShake();
  useEffect(() => {
    return ctx.game.events.on("combat.hitReaction", (event) => {
      if (event.trauma !== undefined) {
        shake.configure({ decayPerSecond: CALIBRATED_TRAUMA_DECAY_PER_SECOND });
        shake.add(event.trauma);
        return;
      }
      if (event.shake === undefined) return;
      if (event.shake.decay !== undefined) shake.configure({ decayPerSecond: event.shake.decay });
      shake.add(event.shake.amplitude);
    });
  }, [ctx, shake]);
  return null;
}
