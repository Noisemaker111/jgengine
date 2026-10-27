import { resolveDamageHit } from "@jgengine/core/combat/damage/damageResolution";
import { applyStatPoolDelta } from "@jgengine/core/stats/statPool";
import { access } from "./adopt-health";
import { enemy } from "./myWorld";

export const onShot = () => {
  const result = resolveDamageHit({
    channel: "kinetic",
    impact: 24,
    target: enemy.id,
    targetTraits: enemy.armored ? ["armored"] : [],
    matchup: { entries: { kinetic: { armored: { impact: 0.5 } } } },
  });
  // Drain it through the same two-method adapter as the health pool.
  applyStatPoolDelta(access, enemy.id, "health", -result.impact);
};
