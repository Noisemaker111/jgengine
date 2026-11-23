import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { breedingPrompts, breedingView } from "../breeding";
import { eggsOnGround } from "../eggs";
import type { ProbeFrame } from "./frame";

/** The closest egg to `here` within `within` metres, or null. */
function nearestEgg(eggs: readonly { at: readonly [number, number, number] }[], here: readonly [number, number, number], within: number): readonly [number, number, number] | null {
  let best: readonly [number, number, number] | null = null;
  let bestDistance = within;
  for (const egg of eggs) {
    const distance = Math.hypot(egg.at[0] - here[0], egg.at[2] - here[2]);
    if (distance <= bestDistance) {
      best = egg.at;
      bestDistance = distance;
    }
  }
  return best;
}

/** What proofs and flows read about breeding: its part of the capture probe. */
export function breedingProbe(ctx: GameContext, { here, sight }: ProbeFrame) {
  const breeding = breedingView(ctx);
  const babyAt = breeding.baby === null ? null : (ctx.scene.entity.get(breeding.baby.id)?.position ?? null);
  return {
    // The nearest egg on the ground within 60 m, and the nearest cooking pot placed.
    ...sight("wildEgg", nearestEgg(eggsOnGround(ctx), here, 60)),
    // Breeding: 1 while a pair is mating; eggs lying, the nearest's incubation and health in percent and its °C;
    // babies growing, the first one's maturation and imprint in percent, 1 while it asks for care, its size in percent.
    mating: breeding.mating ? 1 : 0,
    eggs: breeding.eggs,
    eggProgress: breeding.egg === null ? -1 : Math.round(breeding.egg.progress * 100),
    eggHealth: breeding.egg === null ? -1 : Math.round(breeding.egg.health * 100),
    eggTemperature: breeding.egg === null ? -99 : Math.round(breeding.egg.temperature),
    babies: breeding.babies,
    babyMatured: breeding.baby === null ? -1 : Math.round(breeding.baby.matured * 100),
    babyImprint: breeding.baby === null ? -1 : Math.round(breeding.baby.imprint * 100),
    babyWants: breeding.baby?.wants === null || breeding.baby === null ? 0 : 1,
    babySize: breeding.baby === null ? -1 : Math.round(breeding.baby.size * 100),
    atBaby: breedingPrompts(ctx).length > 0 ? 1 : 0,
    ...sight("baby", babyAt),
  };
}
