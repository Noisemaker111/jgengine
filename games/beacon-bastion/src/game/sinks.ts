import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { creepDef } from "./entities/enemies/catalog";
import { keep, runEnded } from "./keep";
import { currentWaveNumber, gameClockMs, session } from "./session";
import { BUILD_PLOTS, FLANK_POINT_KEY, HAS_FLANK, SPAWN_POINT_KEY, type BuildPlot } from "./world/path";

/**
 * In-day spending for a town whose plots are all staffed and promoted: one-shot gear for a worker,
 * the town's timed actions, and spare lots bought open. Gear and actions cost more each wave, so a
 * deep Overtime night still has somewhere for its cash to go; each lot costs half again the last.
 */

export interface GearDef {
  label: string;
  detail: string;
  /** Multipliers on the worker's pace and damage, and extra reach, while the gear lasts. */
  rate?: number;
  damage?: number;
  range?: number;
}

/** How long a piece of gear lasts, and what it costs on wave 1. */
export const GEAR_RULE = { seconds: 20, cash: 40 } as const;

const PACE = (label: string, detail: string): GearDef => ({ label, detail, rate: 1.8 });
const PUNCH = (label: string, detail: string): GearDef => ({ label, detail, damage: 1.9 });

export const GEAR: Readonly<Record<string, GearDef>> = {
  worker_barista: { label: "Espresso Shot", detail: "Throws twice as fast for 20 s", rate: 2 },
  worker_plumber: { label: "Pressure Hose", detail: "+80% damage and +2 m reach for 20 s", damage: 1.8, range: 2 },
  worker_farmer: PUNCH("Sharpened Pitchfork", "+90% damage for 20 s"),
  worker_grandma: PACE("Fresh Cookies", "Knits 80% faster for 20 s"),
  worker_electrician: PUNCH("High-Voltage Spool", "+90% damage for 20 s"),
  worker_teacher: PACE("Gold Stars", "Works 80% faster for 20 s"),
  worker_librarian: { label: "Late Fees", detail: "+90% damage and +1.5 m hush for 20 s", damage: 1.9, range: 1.5 },
  worker_construction: PUNCH("Diamond Bit", "+90% damage for 20 s"),
  worker_firefighter: { label: "Turbo Pump", detail: "Sprays 80% faster and +1.5 m reach for 20 s", rate: 1.8, range: 1.5 },
  worker_janitor: PACE("Industrial Mop", "Unplugs 80% faster for 20 s"),
  worker_mail: PACE("Express Bag", "Throws 80% faster for 20 s"),
  worker_monk: { label: "Silent Retreat", detail: "+3 m offline aura for 20 s", range: 3 },
  worker_itguy: PACE("Admin Rights", "Works 80% faster for 20 s"),
  worker_lawyer: PUNCH("Billable Hours", "+90% damage for 20 s"),
};

export type TownActionId = "outage" | "wifi";

export interface TownActionDef {
  id: TownActionId;
  label: string;
  detail: string;
  /** Cost on wave 1. */
  cash: number;
  seconds: number;
}

export const TOWN_ACTIONS: Readonly<Record<TownActionId, TownActionDef>> = {
  outage: { id: "outage", label: "Power Outage", detail: "Every piece of tech on one road stops dead and goes quiet for 10 s", cash: 120, seconds: 10 },
  wifi: { id: "wifi", label: "Free Wi-Fi Off", detail: "Routers stop boosting and patching the tech for 25 s", cash: 80, seconds: 25 },
};

/** A spare lot: the first costs `cash`, each after it `growth` times the last. */
export const LOT_RULE = { cash: 200, growth: 1.5 } as const;

/** Gear and town actions cost this much more each wave. */
export const SINK_RAMP = 0.15;

export function sinkScale(wave: number): number {
  return 1 + SINK_RAMP * Math.max(0, wave - 1);
}

const wave = () => Math.max(1, currentWaveNumber());

export function gearCost(kind: string, atWave = wave()): number {
  return GEAR[kind] === undefined ? 0 : Math.round(GEAR_RULE.cash * sinkScale(atWave));
}

export function actionCost(id: TownActionId, atWave = wave()): number {
  return Math.round(TOWN_ACTIONS[id].cash * sinkScale(atWave));
}

export function lotCost(): number {
  return Math.round(LOT_RULE.cash * LOT_RULE.growth ** session.sinks.spares.size);
}

/** The plots a worker can stand on right now: every authored plot, and the spare lots bought open. */
export function openPlots(): readonly BuildPlot[] {
  return BUILD_PLOTS.filter((plot) => !plot.spare || session.sinks.spares.has(plot.id));
}

/** The next spare lot the town could buy, or null when every lot is open. */
export function nextLot(): BuildPlot | null {
  return BUILD_PLOTS.find((plot) => plot.spare && !session.sinks.spares.has(plot.id)) ?? null;
}

/** What gear the worker is carrying right now (identity when none). */
export function gearBoost(towerId: string, nowMs: number): { rate: number; damage: number; range: number } {
  const worn = session.sinks.gear.get(towerId);
  if (worn === undefined || worn.untilMs <= nowMs) return { rate: 1, damage: 1, range: 0 };
  const def = GEAR[worn.kind];
  return { rate: def?.rate ?? 1, damage: def?.damage ?? 1, range: def?.range ?? 0 };
}

/** Whether a road's tech is cut off right now. */
export function outageOn(route: string, nowMs: number): boolean {
  return (session.sinks.outage.get(route) ?? 0) > nowMs;
}

export function wifiOff(nowMs: number): boolean {
  return session.sinks.wifiOffUntilMs > nowMs;
}

type Refusal = { reason: string; message?: string };

function pay(ctx: GameContext, cost: number): Refusal | null {
  const world = keep.of(ctx);
  if (runEnded(world)) return { reason: "run-ended" };
  const gold = world.num("keep.gold");
  return gold >= cost ? null : { reason: "cost", message: `Needs ${cost - gold} more cash` };
}

function spend(ctx: GameContext, cost: number): void {
  keep.emit(ctx, { kind: "spend", scale: cost });
}

/** Why the town can't buy this now, or null. */
export function sinkRefusal(ctx: GameContext, offer: { gear: string } | { action: TownActionId; route?: string } | { lot: true }): Refusal | null {
  if ("gear" in offer) {
    const tower = keep.of(ctx).instance(offer.gear);
    if (tower === null || !tower.ready) return { reason: "no-worker", message: "Pick a worker on the street" };
    if (GEAR[tower.kind] === undefined) return { reason: "no-gear" };
    if ((session.sinks.gear.get(tower.id)?.untilMs ?? 0) > gameClockMs(ctx)) return { reason: "geared", message: "Still using the last one" };
    return pay(ctx, gearCost(tower.kind));
  }
  if ("lot" in offer) {
    if (nextLot() === null) return { reason: "no-lot", message: "Every lot on the street is open" };
    return pay(ctx, lotCost());
  }
  const now = gameClockMs(ctx);
  if (offer.action === "outage") {
    const route = offer.route ?? SPAWN_POINT_KEY;
    if (route !== SPAWN_POINT_KEY && !(route === FLANK_POINT_KEY && HAS_FLANK)) return { reason: "no-road" };
    if (outageOn(route, now)) return { reason: "active", message: "That road is already dark" };
  } else if (wifiOff(now)) return { reason: "active", message: "The Wi-Fi is already off" };
  return pay(ctx, actionCost(offer.action));
}

/** Buy it: gear goes on the worker, an action lands on the street, a lot opens. Returns whether it went through. */
export function buySink(ctx: GameContext, offer: { gear: string } | { action: TownActionId; route?: string } | { lot: true }): boolean {
  if (sinkRefusal(ctx, offer) !== null) return false;
  const now = gameClockMs(ctx);
  if ("gear" in offer) {
    const tower = keep.of(ctx).instance(offer.gear)!;
    spend(ctx, gearCost(tower.kind));
    session.sinks.gear.set(tower.id, { kind: tower.kind, untilMs: now + GEAR_RULE.seconds * 1000 });
    ctx.scene.entity.floatText({ instanceId: tower.id, text: `${GEAR[tower.kind]!.label}!`, element: "holy" });
    ctx.game.playEntityAnimation(tower.id, "cheer");
    return true;
  }
  if ("lot" in offer) {
    const lot = nextLot()!;
    spend(ctx, lotCost());
    session.sinks.spares.add(lot.id);
    ctx.scene.entity.floatText({ position: [lot.position[0], lot.position[1] + 1.2, lot.position[2]], text: "New lot open!", element: "holy" });
    return true;
  }
  spend(ctx, actionCost(offer.action));
  if (offer.action === "outage") {
    const route = offer.route ?? SPAWN_POINT_KEY;
    session.sinks.outage.set(route, now + TOWN_ACTIONS.outage.seconds * 1000);
    for (const creep of session.creeps.values()) {
      if (creep.route === route) ctx.scene.entity.floatText({ instanceId: creep.instanceId, text: "No power", element: "frost", scale: 0.7 });
    }
  } else {
    session.sinks.wifiOffUntilMs = now + TOWN_ACTIONS.wifi.seconds * 1000;
    for (const creep of session.creeps.values()) {
      const def = creepDef(creep.catalogId);
      if (def.boosts !== undefined || def.heals !== undefined) ctx.scene.entity.floatText({ instanceId: creep.instanceId, text: "No signal", element: "frost", scale: 0.8 });
    }
  }
  ctx.game.audio.play("upgrade");
  return true;
}

type SinkInput = { gear?: string; action?: string; route?: string; lot?: boolean } | undefined;

function offerOf(input: SinkInput): Parameters<typeof buySink>[1] | null {
  if (typeof input?.gear === "string") return { gear: input.gear };
  if (input?.lot === true) return { lot: true };
  if (input?.action === "outage" || input?.action === "wifi") return { action: input.action, ...(typeof input.route === "string" ? { route: input.route } : {}) };
  return null;
}

/** `town.buy`: the HUD's town actions and lots, and the worker card's gear. */
export function registerSinkCommands(ctx: GameContext): void {
  ctx.game.commands.define<SinkInput>("town.buy", {
    validate: (state, input) => {
      const offer = offerOf(input);
      return offer === null ? { reason: "no-offer" } : sinkRefusal(state, offer);
    },
    apply: (state, input) => {
      buySink(state, offerOf(input)!);
      return state;
    },
  });
}
