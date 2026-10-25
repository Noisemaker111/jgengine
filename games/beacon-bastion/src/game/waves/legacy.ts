import { createRunDraft, type RunModifierOffer } from "@jgengine/core/game/runDraft";
import { createRunLoop, type RunChange, type RunLoop, type RunLoopState } from "@jgengine/core/run/runLoop";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { seededRng } from "@jgengine/shell/gameKit";

import { STARTING_GOLD, STARTING_LIVES } from "../entities/base/catalog";
import { campaign, councilAdd, difficultyOf, recordStars, starsFor } from "../campaign";
import { keep } from "../keep";
import { currentWaveNumber } from "../session";
import { DIRECTOR_SEED, TOTAL_WAVES } from "./manifest";

export interface BoonEffect {
  /** Extra gold in the next defense's opening purse. */
  gold?: number;
  /** Extra lives on the next keep. */
  lives?: number;
  /** Added to the kill-pay multiplier for the whole run, as a fraction (0.4 = +40%). */
  bounty?: number;
}

/** A relic the result card can offer: banked progress the next defense carries in. */
export interface BoonDef {
  id: string;
  label: string;
  detail: string;
  /** Relative odds in the engine's seeded draw. */
  weight: number;
  effect: BoonEffect;
}

export const BOONS: readonly BoonDef[] = [
  { id: "spoils", label: "Spoils of the Keep", detail: "+60 gold in the opening purse", weight: 3, effect: { gold: 60 } },
  { id: "gate", label: "Reinforced Gate", detail: "+5 lives on the keep", weight: 3, effect: { lives: 5 } },
  { id: "writ", label: "Bounty Writ", detail: "Kill pay +40% for the whole run", weight: 2, effect: { bounty: 0.4 } },
  { id: "levy", label: "Warden's Levy", detail: "+35 gold and kill pay +15%", weight: 2, effect: { gold: 35, bounty: 0.15 } },
  { id: "mason", label: "Stonemason's Gift", detail: "+3 lives and +25 gold", weight: 2, effect: { lives: 3, gold: 25 } },
];

/**
 * The relics are the run loop's authored change table: one entry per relic, with the weight the old
 * local draw used. `after: 1` keeps the first defense plain, so a relic only rides in once a defense
 * has been banked.
 */
export const RELIC_TABLE: readonly RunChange<BoonEffect>[] = BOONS.map((boon) => ({
  id: boon.id,
  value: boon.effect,
  weight: boon.weight,
  after: 1,
}));

/** The same relics as the engine's draft offers: it presents the three and validates the pick. */
const RELIC_OFFERS: readonly RunModifierOffer[] = BOONS.map((boon) => ({
  id: boon.id,
  weight: boon.weight,
  label: boon.label,
}));

/** How much of the purse is banked, how much the vault holds, and how many relics are offered. */
export const BANK_RULE = { share: 0.5, cap: 200, offerCount: 3 } as const;

/** What a completed defense leaves behind for the next one. Persisted with its keep. */
export interface LegacyState {
  /** Waves reached across every finished defense under this keep. */
  standing: number;
  /** Gold the last defense banked for the next opening purse, as the keep's vault caps it. */
  bankedGold: number;
  /** The relics the result card is offering right now, in draw order. */
  offer: string[];
  /** The engine run loop: the run in progress, what it banked or lost, and the relic it opened with. */
  run: RunLoopState;
}

/** A keep with nothing banked: no run has opened, so the first defense starts plain. */
export function freshLegacy(): LegacyState {
  return {
    standing: 0,
    bankedGold: 0,
    offer: [],
    run: { run: 0, completed: 0, haul: 0, changeId: null, bankedTotal: 0, lostTotal: 0, bestHaul: 0 },
  };
}

/** The keep's banked progress, in the reactive store so the HUD and the save document see one value. */
export const legacy = defineStore<LegacyState>("beacon:legacy", freshLegacy);

/**
 * Each keep's engine run loop: it holds the purse at risk, banks the half the keep keeps, and
 * remembers the relic the defense in progress opened with. Per context, because a host can serve
 * several keeps at once.
 */
const loops = perContext(() => createRunLoop<BoonEffect>({ seed: DIRECTOR_SEED, changes: RELIC_TABLE }));

export function relicLoop(ctx: GameContext): RunLoop<BoonEffect> {
  return loops(ctx);
}

export function boonDef(id: string | null): BoonDef | null {
  if (id === null) return null;
  return BOONS.find((boon) => boon.id === id) ?? null;
}

/** The relic the defense in progress opened with, as the engine loop holds it. */
export function carriedRelic(state: LegacyState): BoonDef | null {
  return boonDef(state.run.changeId);
}

/**
 * The three relics a result card offers: the engine's draft presents them weighted and without
 * repeats, from the run the loop just settled and the change it drew for the next one, so the same
 * finished run always offers the same three.
 */
export function drawRelics(seed: string, count: number = BANK_RULE.offerCount): string[] {
  const draft = createRunDraft({ offers: RELIC_OFFERS, rng: seededRng(seed) });
  return draft.present(count).map((offer) => offer.id);
}

/**
 * Bank a finished defense: the engine loop prices what the purse banks and draws the change the next
 * defense opens with, while the keep adds the waves it held, caps what its vault holds, and deals the
 * three relics the player picks from. Guarded by the keep's `banked` fact, so a win and a death in the same
 * frame bank once.
 */
export function finishRun(ctx: GameContext): void {
  const world = keep.of(ctx);
  if (world.fact("keep.banked") === true) return;
  world.set("keep.banked", true);
  const held = world.fact("keep.held") === true;
  const difficulty = campaign.read(ctx).difficulty;
  world.set("keep.stars", recordStars(ctx, starsFor(held, world.num("keep.lives"), world.num("keep.lives_max"), difficulty)));
  const loop = relicLoop(ctx);
  const wave = Math.max(1, Math.min(TOTAL_WAVES, currentWaveNumber()));
  loop.carry(world.num("keep.gold"));
  const settlement = loop.settle("banked", BANK_RULE.share);
  const previous = legacy.read(ctx);
  legacy.write(ctx, {
    standing: previous.standing + wave,
    bankedGold: Math.min(BANK_RULE.cap, settlement.banked),
    offer: drawRelics(`${DIRECTOR_SEED}:${settlement.completed}:${settlement.next.changeId ?? "none"}`),
    run: loop.snapshot(),
  });
}

/**
 * Take one of the offered relics, or none. The pick becomes the change the next defense opens with,
 * so what rides into the run is the loop's own state instead of a field the game keeps beside it.
 */
export function chooseRelic(ctx: GameContext, id: string | null): boolean {
  const previous = legacy.read(ctx);
  if (id !== null && !previous.offer.includes(id)) return false;
  const loop = relicLoop(ctx);
  const state = loop.snapshot();
  loop.restore({
    ...state,
    // A settled run leaves no run open; the pick opens the next one around the chosen relic.
    run: state.run > state.completed ? state.run : state.completed + 1,
    changeId: id,
  });
  legacy.write(ctx, { ...previous, offer: [], run: loop.snapshot() });
  return true;
}

/**
 * Open a defense: the loop adopts the relic this one carries and clears what it carries. A run opened
 * without a pick (the host's restart) keeps the relic the last defense carried, so the pick stays the
 * only thing that changes it.
 */
export function startDefense(ctx: GameContext): void {
  const loop = relicLoop(ctx);
  const state = loop.snapshot();
  if (state.run <= state.completed) {
    loop.restore({ ...state, run: state.completed + 1, changeId: state.changeId });
  }
  loop.start();
  legacy.write(ctx, { ...legacy.read(ctx), run: loop.snapshot() });
}

export function openingGold(state: LegacyState): number {
  const gold = carriedRelic(state)?.effect.gold ?? 0;
  return STARTING_GOLD + Math.min(BANK_RULE.cap, state.bankedGold) + gold;
}

export function openingLives(state: LegacyState): number {
  return STARTING_LIVES + (carriedRelic(state)?.effect.lives ?? 0);
}

/**
 * The purse and walls a new defense opens with: the bank and relic, then the difficulty's swing and
 * the war council's seats.
 */
export function openingKeep(ctx: GameContext): { gold: number; lives: number } {
  const banked = legacy.read(ctx);
  const difficulty = difficultyOf(ctx);
  return {
    gold: Math.max(0, openingGold(banked) + difficulty.gold + councilAdd(ctx, "opening_gold")),
    lives: Math.max(1, openingLives(banked) - STARTING_LIVES + difficulty.lives + councilAdd(ctx, "lives")),
  };
}

/** The relic's multiplier on every kill bounty, on top of the wave's. */
export function relicBountyScale(state: LegacyState): number {
  return 1 + (carriedRelic(state)?.effect.bounty ?? 0);
}

const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A loop state plain JSON can carry, or `null` when it is not one this loop could have written. */
function readRun(value: unknown): RunLoopState | null {
  if (typeof value !== "object" || value === null) return null;
  const run = value as RunLoopState;
  if (!count(run.run) || !count(run.completed) || run.run < run.completed) return null;
  if (!count(run.haul) || !count(run.bankedTotal) || !count(run.lostTotal) || !count(run.bestHaul)) return null;
  if (run.changeId !== null && typeof run.changeId !== "string") return null;
  return {
    run: run.run,
    completed: run.completed,
    haul: run.haul,
    changeId: run.changeId,
    bankedTotal: run.bankedTotal,
    lostTotal: run.lostTotal,
    bestHaul: run.bestHaul,
  };
}

/** A document written before the run loop: `runs` finished defenses and `boonId` the carried relic. */
function migratedRun(runs: unknown, boonId: unknown): RunLoopState | null {
  if (!count(runs) || (boonId !== null && typeof boonId !== "string")) return null;
  return {
    // The stored defense is the one in progress, so its run sits open above the finished ones.
    run: runs + 1,
    completed: runs,
    haul: 0,
    changeId: boonId !== null && RELIC_TABLE.some((relic) => relic.id === boonId) ? boonId : null,
    bankedTotal: 0,
    lostTotal: 0,
    bestHaul: 0,
  };
}

/** A stored keep as this build holds it: the current document, or the pre-loop one migrated. */
export function upgradeLegacy(value: unknown): LegacyState | null {
  if (typeof value !== "object" || value === null) return null;
  const section = value as Partial<LegacyState> & { runs?: unknown; boonId?: unknown };
  if (!count(section.standing) || !count(section.bankedGold)) return null;
  if (!Array.isArray(section.offer) || !section.offer.every((id) => typeof id === "string")) return null;
  const run = section.run !== undefined ? readRun(section.run) : migratedRun(section.runs ?? 0, section.boonId ?? null);
  if (run === null) return null;
  return { standing: section.standing, bankedGold: section.bankedGold, offer: [...section.offer], run };
}

export function readLegacy(ctx: GameContext): LegacyState {
  return legacy.read(ctx);
}

/** Put a stored keep back on both the store and its engine loop - one owner for the loop's state. */
export function writeLegacy(ctx: GameContext, next: LegacyState): void {
  relicLoop(ctx).restore(next.run);
  legacy.write(ctx, next);
}
