/** The two one-shot events the shell fires automatically for an entity, from `combat.hitReaction` and `entity.died`. */
export const AUTO_ONE_SHOT_EVENTS = ["hit", "death"] as const;

/**
 * Resolves the clip name a one-shot `event` should play from a model's `animation.oneShots` map, or `null`
 * if the event isn't bound. A `string[]` binding picks a variant by `roll` (a value in `[0, 1)`), so combat
 * can vary attack swings. Pure and deterministic given `roll` — the shell supplies the randomness.
 */
export function resolveOneShotClip(
  oneShots: Record<string, string | readonly string[]> | undefined,
  event: string,
  roll: number,
): string | null {
  const spec = oneShots?.[event];
  if (spec === undefined) return null;
  if (typeof spec === "string") return spec;
  if (spec.length === 0) return null;
  const index = Math.min(spec.length - 1, Math.max(0, Math.floor(roll * spec.length)));
  return spec[index] ?? null;
}
