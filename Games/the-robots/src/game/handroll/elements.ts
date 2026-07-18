import { resolveMatchup, type DamageMatchup } from "@jgengine/core/combat/damageMatchup";
import { resolveReceivedDamage, type ReceivedModifier } from "@jgengine/core/combat/receivedDamage";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { bonus } from "../characters";
import type { GunDef, GunElement, Surface } from "./guns";

interface DotEntry {
  targetId: string;
  fromId: string;
  element: GunElement;
  dps: number;
  untilMs: number;
  nextTickMs: number;
}

/** Per-session active DOTs and flux windows — reclaimed with the context (#632). */
const activeDotsOf = perContext(() => [] as DotEntry[]);
const fluxedUntilOf = perContext(() => new Map<string, number>());

export const DOT_DURATION_MS = 4000;
export const FLUX_DURATION_MS = 8000;
export const FLUX_DAMAGE_MULT = 2;

export function isFluxed(ctx: GameContext, targetId: string, nowMs: number): boolean {
  return (fluxedUntilOf(ctx).get(targetId) ?? 0) > nowMs;
}

/**
 * Element-vs-surface matchup as core-owned data instead of an inlined if/else. Traits are
 * `shielded` (which overrides surface, matching the original precedence) or the bare surface
 * (`flesh`/`armor`); unlisted element/trait pairs fall through to the identity `default`.
 */
const ELEMENT_MATCHUP: DamageMatchup<GunElement, "shielded" | Surface> = {
  entries: {
    shock: { shielded: { impact: 2 } },
    incendiary: { shielded: { impact: 0.75 }, armor: { impact: 0.75 }, flesh: { impact: 1.5 } },
    corrosive: { shielded: { impact: 0.75 }, armor: { impact: 1.5 }, flesh: { impact: 0.9 } },
    flux: { shielded: { impact: 0.75 } },
  },
  default: { impact: 1 },
};

/** Every element except flux — the channels the flux debuff amplifies. */
const NON_FLUX_ELEMENTS: readonly GunElement[] = [
  "none",
  "incendiary",
  "shock",
  "corrosive",
  "explosive",
];

/**
 * The flux debuff expressed as a generic receiver-side modifier: while the target carries `flux`,
 * every non-flux channel it receives is amplified. Amplification is data, not a hardcoded branch.
 */
const FLUX_AMPLIFY: readonly ReceivedModifier[] = [
  {
    id: "flux",
    when: { whileStatus: ["flux"], channels: NON_FLUX_ELEMENTS },
    policy: { kind: "scale", factor: FLUX_DAMAGE_MULT },
  },
];

export function elementalDamageMult(
  ctx: GameContext,
  element: GunElement,
  surface: Surface,
  targetShielded: boolean,
  targetId: string,
  nowMs: number,
): number {
  const traits: readonly ("shielded" | Surface)[] = targetShielded ? ["shielded"] : [surface];
  const base = resolveMatchup(ELEMENT_MATCHUP, element, traits).impact;
  const received = resolveReceivedDamage({
    amount: base,
    context: {
      channel: element,
      target: targetId,
      targetStatuses: isFluxed(ctx, targetId, nowMs) ? ["flux"] : [],
    },
    modifiers: FLUX_AMPLIFY,
  });
  return received.amount;
}

export function applyElementalProc(
  ctx: GameContext,
  rng: () => number,
  gun: GunDef,
  fromId: string,
  targetId: string,
  nowMs: number,
): void {
  if (gun.element === "none" || gun.element === "explosive") return;
  if (rng() >= gun.elementChance + bonus("elementChance")) return;
  if (gun.element === "flux") {
    fluxedUntilOf(ctx).set(targetId, nowMs + FLUX_DURATION_MS);
    return;
  }
  activeDotsOf(ctx).push({
    targetId,
    fromId,
    element: gun.element,
    dps: Math.round(gun.elementDps * (1 + bonus("dotDamage"))),
    untilMs: nowMs + DOT_DURATION_MS,
    nextTickMs: nowMs + 500,
  });
}

export function tickDots(ctx: GameContext, nowMs: number): void {
  const activeDots = activeDotsOf(ctx);
  for (let index = activeDots.length - 1; index >= 0; index -= 1) {
    const dot = activeDots[index]!;
    if (nowMs >= dot.untilMs || ctx.scene.entity.get(dot.targetId) === null) {
      activeDots.splice(index, 1);
      continue;
    }
    if (nowMs < dot.nextTickMs) continue;
    dot.nextTickMs = nowMs + 500;
    ctx.scene.entity.effect({
      from: dot.fromId,
      to: dot.targetId,
      effect: "damage",
      via: { amount: Math.max(1, Math.round(dot.dps / 2)) },
    });
  }
}
