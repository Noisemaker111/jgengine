export type CheckAdvantage = "advantage" | "disadvantage" | "normal";

export interface CheckInput {
  modifier: number;
  dc: number;
  advantage?: CheckAdvantage;
  diceSides?: number;
}

export interface CheckResult {
  rolls: readonly number[];
  roll: number;
  total: number;
  success: boolean;
  critical: "success" | "failure" | null;
}

/**
 * Resolve a tabletop-style pass/fail roll against a target number with modifiers and crit/fumble bands.
 *
 * @capability dice-check resolve a pass/fail roll against a target number with modifiers and crits
 */
export function rollCheck(input: CheckInput, rng: () => number = Math.random): CheckResult {
  const sides = input.diceSides ?? 20;
  const advantage = input.advantage ?? "normal";
  const rollDie = () => Math.floor(rng() * sides) + 1;
  const rolls = advantage === "normal" ? [rollDie()] : [rollDie(), rollDie()];
  const roll =
    advantage === "advantage"
      ? Math.max(...rolls)
      : advantage === "disadvantage"
        ? Math.min(...rolls)
        : rolls[0]!;
  const total = roll + input.modifier;
  const success = total >= input.dc;
  const critical = roll === sides ? "success" : roll === 1 ? "failure" : null;
  return { rolls, roll, total, success, critical };
}
