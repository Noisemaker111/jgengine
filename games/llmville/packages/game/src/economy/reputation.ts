import type { DailyMarketModifier } from "@llmville/game/economy/dailyMarket";

/** Reputation earned when a trained model beats the frontier benchmark. */
export function computeReputationGain(
  modelBenchmark: number,
  frontierBenchmark: number,
): number {
  const lead = modelBenchmark - frontierBenchmark;
  if (lead <= 0) return 0;
  return Math.max(1, Math.floor(lead * 2));
}

const HOSTING_SHARE_MIN = 0.3;
const HOSTING_SHARE_MAX = 0.7;
const REPUTATION_FOR_MAX_HOSTING_SHARE = 100;
const REPUTATION_FOR_MAX_DAILY_BOUNTY = 80;

/** Host revenue share on marketplace contracts (0.3–0.7). */
export function getHostingRevenueShare(reputation: number): number {
  const rep = Math.max(0, reputation);
  const t = Math.min(1, rep / REPUTATION_FOR_MAX_HOSTING_SHARE);
  return HOSTING_SHARE_MIN + (HOSTING_SHARE_MAX - HOSTING_SHARE_MIN) * t;
}

/** Scales upside on daily bounty modifiers (revenue/data bonuses above 1×). */
function getReputationDailyBountyMult(reputation: number): number {
  const rep = Math.max(0, reputation);
  const t = Math.min(1, rep / REPUTATION_FOR_MAX_DAILY_BOUNTY);
  return 1 + t * 0.5;
}

export function applyReputationToDailyModifier(
  modifier: Pick<DailyMarketModifier, "revenueMult" | "dataYieldMult">,
  reputation: number,
): Pick<DailyMarketModifier, "revenueMult" | "dataYieldMult"> {
  const bountyMult = getReputationDailyBountyMult(reputation);
  const scaleBonus = (mult: number) =>
    mult > 1 ? 1 + (mult - 1) * bountyMult : mult;

  return {
    revenueMult: scaleBonus(modifier.revenueMult),
    dataYieldMult: scaleBonus(modifier.dataYieldMult),
  };
}
