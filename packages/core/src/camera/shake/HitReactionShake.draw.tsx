/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect } from "@jgengine/core/ui/jsx";

import { useGameContext } from "@jgengine/ui/provider";

import { CALIBRATED_TRAUMA_DECAY_PER_SECOND } from "./cameraShake";
import { useCameraShake } from "./shakeChannel.draw";

/** @internal */
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
