import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { teleportPlayer } from "@jgengine/core/movement/teleport";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { ridingOf } from "@jgengine/core/scene/riding";
import { crossThresholds } from "@jgengine/core/threshold/thresholds";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";
import { ringWall } from "@jgengine/core/world/ringWall";

import { editorLayers } from "../editorLayers";
import { BAG, HOTBAR } from "./bags";
import { creatureAlive, creatureHealth, moveCreature, removeCreatureNow, slayCreature, spawnCreature, tames } from "./creatures";
import { BROOD_LAIR, BROOD_PHASES, BROOD_TIERS, broodTier, PORTAL, PORTAL_RANGE, SPIT, type BroodPhase, type BroodTier } from "./data/bosses";
import { itemLabel } from "./data/items";
import { setScreen } from "./screens";
import { drugSurvivor, give, survivorLevel, takeAnywhere, webSurvivor } from "./survivor";

/** The layer the lair's wall occupies in the world's collision. */
const SOLIDS_LAYER = "fernwild:broodLair";
/** How near the obelisk's foot E reaches its terminal, metres. */
const TERMINAL_REACH = 12;
/** Seconds the acid takes to fly, for the drawing. */
export const SPIT_FLIGHT = 0.6;
/** Seconds into the fight her first spit comes. */
export const FIRST_SPIT = 3;

/** Where the fight stands: nothing summoned, the portal counting down, the fight, or the winners' wait. */
export type BroodFightPhase = "idle" | "portal" | "fight" | "victory";

/** The fight's own state, saved with the run. */
export interface BroodFight {
  phase: BroodFightPhase;
  /** The difficulty summoned. */
  tier: string | null;
  /** Game time the portal closes or the winners' wait ends; null otherwise. */
  until: number | null;
  survivors: string[];
  companions: string[];
  /** Id → where it is sent back to. */
  returns: Record<string, readonly [number, number, number]>;
}

/** Someone the portal could take in: a survivor or a tame, and where they stood to be sent back to. */
export interface LairCandidate {
  id: string;
  kind: "survivor" | "companion";
  at: readonly [number, number, number];
}

/** What a tribute check found: what is missing, and how many levels short the summoner is. */
export interface TributeCheck {
  ok: boolean;
  missing: { item: string; need: number; have: number }[];
  levelShort: number;
}

/** Who goes back where, when a fight ends. */
export interface LairReturn {
  id: string;
  kind: "survivor" | "companion";
  to: readonly [number, number, number];
}

/** Things that happened on one step of the fight's clock. */
export type BroodFightEvent =
  /** The portal took everyone in range in; the game moves them and spawns her. */
  | { type: "entered"; tier: string; admitted: LairCandidate[]; refused: string[] }
  /** The portal closed with no survivor in range: the tribute is gone, as in ARK. */
  | { type: "closed"; tier: string }
  | { type: "won"; tier: string; survivors: string[]; companions: string[] }
  /** Every survivor is gone: the companions left inside are lost with the fight. */
  | { type: "lost"; tier: string; companions: string[] }
  /** The winners' wait is over: send each back where they came from. */
  | { type: "returned"; tier: string; returns: LairReturn[] };

export function newBroodFight(): BroodFight {
  return { phase: "idle", tier: null, until: null, survivors: [], companions: [], returns: {} };
}

/** What a difficulty asks of the summoner: the tribute it takes and the level it wants. */
export function tributeCheck(tier: BroodTier, have: (item: string) => number, level: number): TributeCheck {
  const missing = Object.entries(tier.tribute)
    .map(([item, need]) => ({ item, need, have: have(item) }))
    .filter((entry) => entry.have < entry.need);
  const levelShort = Math.max(0, tier.minLevel - level);
  return { ok: missing.length === 0 && levelShort === 0, missing, levelShort };
}

/** Take a difficulty's tribute and open the portal. Takes nothing when the lair is busy or the tribute is short. */
export function summonBrood(
  fight: BroodFight,
  tierId: string,
  from: { count(item: string): number; take(item: string, count: number): void },
  level: number,
  now: number,
): { ok: true; fight: BroodFight } | { ok: false; reason: "busy" | "unknown" | "tribute"; check?: TributeCheck } {
  if (fight.phase !== "idle") return { ok: false, reason: "busy" };
  const tier = broodTier(tierId);
  if (tier === null) return { ok: false, reason: "unknown" };
  const check = tributeCheck(tier, (item) => from.count(item), level);
  if (!check.ok) return { ok: false, reason: "tribute", check };
  for (const [item, count] of Object.entries(tier.tribute)) from.take(item, count);
  return { ok: true, fight: { ...newBroodFight(), phase: "portal", tier: tierId, until: now + PORTAL.seconds } };
}

/** What the portal takes: survivors up to its cap, then tames up to theirs. Everyone else is refused. */
export function admitToLair(candidates: readonly LairCandidate[]): { admitted: LairCandidate[]; refused: string[] } {
  const admitted: LairCandidate[] = [];
  const refused: string[] = [];
  let survivors = 0;
  let companions = 0;
  for (const candidate of candidates) {
    if (candidate.kind === "survivor") {
      if (survivors >= PORTAL.maxSurvivors) refused.push(candidate.id);
      else {
        survivors += 1;
        admitted.push(candidate);
      }
      continue;
    }
    if (companions >= PORTAL.maxCompanions) refused.push(candidate.id);
    else {
      companions += 1;
      admitted.push(candidate);
    }
  }
  return { admitted, refused };
}

/** Advance the lair's clock: the portal, the fight and the winners' wait. */
export function tickBroodFight(
  fight: BroodFight,
  now: number,
  bossAlive: boolean,
  gather: () => readonly LairCandidate[],
): { fight: BroodFight; events: BroodFightEvent[] } {
  const tier = fight.tier;
  if (tier === null) return { fight, events: [] };
  if (fight.phase === "portal" && now >= (fight.until ?? now)) {
    const { admitted, refused } = admitToLair(gather());
    if (!admitted.some((entry) => entry.kind === "survivor")) return { fight: newBroodFight(), events: [{ type: "closed", tier }] };
    return {
      fight: {
        phase: "fight",
        tier,
        until: null,
        survivors: admitted.filter((entry) => entry.kind === "survivor").map((entry) => entry.id),
        companions: admitted.filter((entry) => entry.kind === "companion").map((entry) => entry.id),
        returns: Object.fromEntries(admitted.map((entry) => [entry.id, [entry.at[0], entry.at[1], entry.at[2]] as const])),
      },
      events: [{ type: "entered", tier, admitted, refused }],
    };
  }
  if (fight.phase === "fight") {
    if (!bossAlive) {
      return {
        fight: { ...fight, phase: "victory", until: now + PORTAL.victorySeconds },
        events: [{ type: "won", tier, survivors: [...fight.survivors], companions: [...fight.companions] }],
      };
    }
    if (fight.survivors.length === 0) return { fight: newBroodFight(), events: [{ type: "lost", tier, companions: [...fight.companions] }] };
    return { fight, events: [] };
  }
  if (fight.phase === "victory" && now >= (fight.until ?? now)) {
    const kinds = new Map<string, "survivor" | "companion">([
      ...fight.survivors.map((id) => [id, "survivor"] as const),
      ...fight.companions.map((id) => [id, "companion"] as const),
    ]);
    const returns = [...kinds].flatMap(([id, kind]) => {
      const to = fight.returns[id];
      return to === undefined ? [] : [{ id, kind, to }];
    });
    return { fight: newBroodFight(), events: [{ type: "returned", tier, returns }] };
  }
  return { fight, events: [] };
}

/** Someone left the fight (a survivor died, a tame was killed): they are no longer sent back. */
export function leaveFight(fight: BroodFight, id: string): BroodFight {
  return {
    ...fight,
    survivors: fight.survivors.filter((entry) => entry !== id),
    companions: fight.companions.filter((entry) => entry !== id),
    returns: Object.fromEntries(Object.entries(fight.returns).filter(([entry]) => entry !== id)),
  };
}

/** Whether `id` is in the fight now. */
export function isInside(fight: BroodFight, id: string): boolean {
  return (fight.phase === "fight" || fight.phase === "victory") && (fight.survivors.includes(id) || fight.companions.includes(id));
}

/** Seconds left on the portal or the winners' wait; null when nothing counts down. */
export function fightSecondsLeft(fight: BroodFight, now: number): number | null {
  return fight.until === null ? null : Math.max(0, fight.until - now);
}

/** The phase she fights in at a health fraction: the health she has lost puts her on a rung, and she never falls back one. */
export function broodPhaseAt(held: string | null, health: number): BroodPhase {
  const value = Number.isFinite(health) ? Math.max(0, Math.min(1, health)) : 1;
  const steps = BROOD_PHASES.map((phase, index) => ({ id: index, at: phase.atHealth }));
  const crossed = crossThresholds(steps, 1, value, { inclusive: false });
  const deepest = crossed[crossed.length - 1];
  const heldIndex = BROOD_PHASES.findIndex((phase) => phase.id === held);
  const phase = BROOD_PHASES[Math.max(0, heldIndex, deepest === undefined ? 0 : deepest.id)] ?? BROOD_PHASES[0];
  if (phase === undefined) throw new Error("the Broodmother has no phases");
  return phase;
}

interface Brood {
  fight: BroodFight;
  /** The Broodmother's creature id while she is in the lair. */
  boss: string | null;
  /** The phase she holds, by id. */
  phase: string | null;
  /** The Araneo she has called. */
  brood: string[];
  nextSpit: number;
  /** Her last spit, for the drawing: from her to where the survivor stood. */
  spit: { at: number; from: readonly [number, number, number]; to: readonly [number, number, number] } | null;
  /** The phase tell on screen and until when. */
  tell: { text: string; until: number } | null;
}

const broodOf = perContext((ctx: GameContext): Brood => {
  ctx.world.solids.set(SOLIDS_LAYER, lairWall(ctx));
  return { fight: newBroodFight(), boss: null, phase: null, brood: [], nextSpit: 0, spit: null, tell: null };
});

/** The lair's ring wall, standing on its islet. */
export function lairWall(ctx: GameContext) {
  return ringWall({ center: BROOD_LAIR.center, radius: BROOD_LAIR.radius, height: BROOD_LAIR.wallHeight, thickness: 5, sides: 36, ground: ctx.world.groundHeightAt });
}

/** The Green Obelisk: where the terminal stands, on the ground under the floating spire. */
export function greenObelisk(ctx: GameContext): readonly [number, number, number] {
  const marker = markersOfKind(editorLayers, "obelisk").find((entry) => entry.meta?.["color"] === "green");
  if (marker === undefined) throw new Error("editor.scene.json has no green obelisk");
  const { x, z } = marker.position;
  return [x, ctx.world.groundHeightAt(x, z), z];
}

function flat(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
}

function inLair(at: readonly number[]): boolean {
  return Math.hypot(at[0]! - BROOD_LAIR.center[0], at[2]! - BROOD_LAIR.center[1]) <= BROOD_LAIR.radius + 2;
}

/** A point in the lair `along` of the way from its centre to the wall, at `angle` (0 is east, π west). */
function lairSpot(along: number, angle: number): [number, number] {
  return [BROOD_LAIR.center[0] + Math.cos(angle) * BROOD_LAIR.radius * along, BROOD_LAIR.center[1] + Math.sin(angle) * BROOD_LAIR.radius * along];
}

// --- the terminal ----------------------------------------------------------------------------------

function nearTerminal(ctx: GameContext): boolean {
  const me = ctx.scene.entity.get(ctx.player.userId);
  return me !== null && flat(me.position, greenObelisk(ctx)) <= TERMINAL_REACH;
}

function carried(ctx: GameContext, item: string): number {
  return ctx.player.inventory.count(BAG, item) + ctx.player.inventory.count(HOTBAR, item);
}

/** E at the Green Obelisk's foot: its terminal, listing each difficulty's tribute. */
export function obeliskPrompts(ctx: GameContext): PositionedPrompt[] {
  if (!nearTerminal(ctx) || broodOf(ctx).fight.phase !== "idle") return [];
  const [x, , z] = greenObelisk(ctx);
  return [{ id: "obelisk:green", position: { x, z }, priority: 3, prompt: proximityPrompt({ radius: TERMINAL_REACH + 1, display: keybind("interact", "Green Obelisk · Summon the Broodmother"), invoke: command("obeliskUse") }) }];
}

export function useObelisk(ctx: GameContext): void {
  if (nearTerminal(ctx)) setScreen(ctx, "obelisk");
}

/** Pay a difficulty's tribute and open the portal. */
export function summonBroodmother(ctx: GameContext, tierId: string): void {
  const tier = broodTier(tierId);
  if (tier === null || !nearTerminal(ctx)) return;
  const brood = broodOf(ctx);
  const result = summonBrood(brood.fight, tier.id, { count: (item) => carried(ctx, item), take: (item, count) => void takeAnywhere(ctx, item, count) }, survivorLevel(ctx), ctx.time.now());
  if (!result.ok) {
    const check = result.check;
    const why = result.reason === "busy" ? "The Broodmother is already summoned" : check !== undefined && check.levelShort > 0 ? `Requires level ${tier.minLevel}` : `Missing ${check?.missing.map((entry) => `${entry.need - entry.have} ${itemLabel(entry.item)}`).join(", ") ?? "tribute"}`;
    ctx.game.notices.push({ text: why, tone: "deny" });
    return;
  }
  brood.fight = result.fight;
  setScreen(ctx, null);
  ctx.game.notices.push({ text: `${tier.label} Broodmother summoned. The portal opens in ${Math.round(fightSecondsLeft(brood.fight, ctx.time.now()) ?? 0)} seconds: stay near the obelisk with your tames.`, tone: "success" });
}

/** What the terminal screen lists: each difficulty, its level and tribute against what the survivor carries. */
export function obeliskView(ctx: GameContext) {
  const level = survivorLevel(ctx);
  const fight = broodOf(ctx).fight;
  return {
    busy: fight.phase !== "idle",
    tiers: BROOD_TIERS.map((tier) => {
      const check = tributeCheck(tier, (item) => carried(ctx, item), level);
      return {
        id: tier.id,
        label: tier.label,
        minLevel: tier.minLevel,
        levelOk: check.levelShort === 0,
        ok: check.ok,
        tribute: Object.entries(tier.tribute).map(([item, need]) => ({ item, label: itemLabel(item), need, have: carried(ctx, item) })),
        rewards: Object.entries(tier.rewards).map(([item, count]) => ({ item, label: itemLabel(item), count })),
      };
    }),
  };
}

// --- the fight -------------------------------------------------------------------------------------

/** Everyone the portal can take: the survivor and each living tame of theirs within range of the obelisk. */
function gather(ctx: GameContext): LairCandidate[] {
  const obelisk = greenObelisk(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null || flat(me.position, obelisk) > PORTAL_RANGE) return [];
  const out: LairCandidate[] = [{ id: ctx.player.userId, kind: "survivor", at: [me.position[0], me.position[1], me.position[2]] }];
  for (const tame of tames(ctx)) if (flat(tame.at, obelisk) <= PORTAL_RANGE) out.push({ id: tame.id, kind: "companion", at: [tame.at[0], tame.at[1], tame.at[2]] });
  return out;
}

function callBrood(ctx: GameContext, brood: Brood, count: number): void {
  for (let index = 0; index < count; index += 1) {
    // Out of the walls all round her.
    const id = spawnCreature(ctx, "araneo", lairSpot(0.85, (index / count) * Math.PI * 2 + ctx.rng() * 0.4), { level: 1 + Math.floor(ctx.rng() * 30) });
    if (id !== null) brood.brood.push(id);
  }
}

function clearLair(ctx: GameContext, brood: Brood): void {
  for (const id of [...brood.brood, ...(brood.boss === null ? [] : [brood.boss])]) removeCreatureNow(ctx, id);
  brood.boss = null;
  brood.phase = null;
  brood.brood = [];
  brood.spit = null;
  brood.tell = null;
}

function enter(ctx: GameContext, brood: Brood, tierId: string, admitted: readonly LairCandidate[], refused: number): void {
  const tier = broodTier(tierId)!;
  // ARK's portal pulls riders off their mounts; both go through.
  ridingOf(ctx).dismount(ctx.player.userId);
  const start = lairSpot(0.75, Math.PI);
  teleportPlayer(ctx, ctx.player.userId, { x: start[0], z: start[1], yaw: Math.PI / 2 });
  // The tames stand either side of the survivor, not between them and her.
  admitted
    .filter((entry) => entry.kind === "companion")
    .forEach((entry, index) => moveCreature(ctx, entry.id, lairSpot(0.8, Math.PI + (index % 2 === 0 ? 1 : -1) * (0.3 + Math.floor(index / 2) * 0.15))));
  // She waits in the middle of her lair.
  brood.boss = spawnCreature(ctx, tier.species, lairSpot(0, 0), { level: 1 });
  brood.phase = broodPhaseAt(null, 1).id;
  // She greets them with a spit before she closes in.
  brood.nextSpit = ctx.time.now() + FIRST_SPIT;
  callBrood(ctx, brood, BROOD_PHASES[0]!.brood);
  const left = refused > 0 ? ` ${refused} could not come through.` : "";
  ctx.game.notices.push({ text: `The ${tier.label} Broodmother's lair. Kill her!${left}`, tone: "deny" });
}

function fight(ctx: GameContext, brood: Brood): void {
  const now = ctx.time.now();
  const me = ctx.scene.entity.get(ctx.player.userId);
  // A survivor no longer in the lair (dead, back on the beach) has left the fight; so has a tame that died.
  if (isInside(brood.fight, ctx.player.userId) && (me === null || !inLair(me.position))) brood.fight = leaveFight(brood.fight, ctx.player.userId);
  for (const id of brood.fight.companions) if (!creatureAlive(ctx, id)) brood.fight = leaveFight(brood.fight, id);
  const health = brood.boss === null ? null : creatureHealth(ctx, brood.boss);
  if (health === null || brood.fight.phase !== "fight") return;
  const phase = broodPhaseAt(brood.phase, health);
  const changed = phase.id !== brood.phase;
  const tell = changed ? phase.tell ?? null : null;
  brood.phase = phase.id;
  if (tell !== null) {
    brood.tell = { text: tell.id, until: now + tell.telegraphSeconds };
    ctx.game.notices.push({ text: tell.id, tone: "deny" });
  }
  if (changed) callBrood(ctx, brood, phase.brood);
  const boss = ctx.scene.entity.get(brood.boss!);
  if (now >= brood.nextSpit && boss !== null && me !== null && isInside(brood.fight, ctx.player.userId)) {
    brood.nextSpit = now + phase.spitEvery;
    if (flat(boss.position, me.position) <= SPIT.range) {
      brood.spit = { at: now, from: [boss.position[0], boss.position[1] + 3, boss.position[2]], to: [me.position[0], me.position[1] + 1, me.position[2]] };
      ctx.scene.entity.effect({ from: boss.id, to: me.id, effect: "damage", via: { amount: SPIT.damage } });
      drugSurvivor(ctx, SPIT.torpor);
      webSurvivor(ctx, SPIT.webSlow, SPIT.webSeconds);
      ctx.scene.entity.floatText({ instanceId: me.id, text: "Webbed!", kind: "damage" });
    }
  }
}

/** The obelisk's clock: the portal, the fight, the win and the trip home. */
export function tickBroodmother(ctx: GameContext): void {
  const brood = broodOf(ctx);
  const now = ctx.time.now();
  if (brood.tell !== null && brood.tell.until <= now) brood.tell = null;
  if (brood.fight.phase === "fight") fight(ctx, brood);
  const tick = tickBroodFight(brood.fight, now, brood.boss !== null && creatureAlive(ctx, brood.boss), () => gather(ctx));
  brood.fight = tick.fight;
  for (const event of tick.events) {
    const tier = broodTier(event.tier)!;
    if (event.type === "entered") enter(ctx, brood, event.tier, event.admitted, event.refused.length);
    else if (event.type === "closed") ctx.game.notices.push({ text: "The portal closed with nobody near the obelisk. The tribute is spent.", tone: "deny" });
    else if (event.type === "won") {
      if (event.survivors.includes(ctx.player.userId)) for (const [item, count] of Object.entries(tier.rewards)) give(ctx, item, count);
      // Her brood dies with her.
      for (const id of brood.brood) slayCreature(ctx, id);
      ctx.game.notices.push({ text: `The ${tier.label} Broodmother is dead! ${Object.entries(tier.rewards).map(([item, count]) => `${count} ${itemLabel(item)}`).join(", ")}. Back to the obelisk in a minute.`, tone: "success" });
    } else if (event.type === "lost") {
      for (const id of event.companions) slayCreature(ctx, id);
      clearLair(ctx, brood);
      ctx.game.notices.push({ text: event.companions.length > 0 ? `The Broodmother won. ${event.companions.length} tames left in her lair are lost.` : "The Broodmother won.", tone: "deny" });
    } else if (event.type === "returned") {
      const obelisk = greenObelisk(ctx);
      for (const entry of event.returns) {
        // Home where they stood, looking at the obelisk.
        if (entry.kind === "survivor") teleportPlayer(ctx, entry.id, { x: entry.to[0], z: entry.to[2], yaw: Math.atan2(obelisk[0] - entry.to[0], obelisk[2] - entry.to[2]) });
        else moveCreature(ctx, entry.id, [entry.to[0], entry.to[2]]);
      }
      clearLair(ctx, brood);
      ctx.game.notices.push({ text: "Back at the Green Obelisk", tone: "success" });
    }
  }
}

/** What the HUD and the world draw: the fight's phase and clock, her health and phase, the portal and her last spit. */
export function broodView(ctx: GameContext) {
  const brood = broodOf(ctx);
  const fight = brood.fight;
  const now = ctx.time.now();
  const tier = fight.tier === null ? null : broodTier(fight.tier);
  return {
    phase: fight.phase,
    tier: tier?.label ?? null,
    secondsLeft: fightSecondsLeft(fight, now),
    inside: isInside(fight, ctx.player.userId),
    boss: brood.boss === null ? null : { id: brood.boss, health: creatureHealth(ctx, brood.boss) ?? 0, phase: brood.phase },
    brood: brood.brood.filter((id) => creatureAlive(ctx, id)).length,
    tell: brood.tell?.text ?? null,
    survivors: fight.survivors.length,
    companions: fight.companions.length,
  };
}

export type BroodView = ReturnType<typeof broodView>;

/** The acid in flight, for the drawing: where it is now, or null. */
export function spitInFlight(ctx: GameContext): readonly [number, number, number] | null {
  const spit = broodOf(ctx).spit;
  const t = spit === null ? 1 : (ctx.time.now() - spit.at) / SPIT_FLIGHT;
  if (spit === null || t < 0 || t >= 1) return null;
  const lerp = (i: number) => spit.from[i]! + (spit.to[i]! - spit.from[i]!) * t;
  return [lerp(0), lerp(1) + Math.sin(t * Math.PI) * 4, lerp(2)];
}

/** ARK's admin SetHealth on the Broodmother: her health to this share of its max, for proofs. */
export function setBroodHealth(ctx: GameContext, share: number): void {
  const boss = broodOf(ctx).boss;
  const health = boss === null ? null : ctx.scene.entity.stats.get(boss, "health");
  if (boss === null || health === null) return;
  ctx.scene.entity.stats.set(boss, "health", { current: Math.max(0, Math.min(1, share)) * health.max });
}

interface BroodSave {
  fight: BroodFight;
  boss: string | null;
  phase: string | null;
  brood: string[];
  nextSpit: number;
}

export function broodSave(ctx: GameContext) {
  return {
    key: "fernwild.broodmother2",
    snapshot: (): BroodSave => {
      const brood = broodOf(ctx);
      return { fight: structuredClone(brood.fight), boss: brood.boss, phase: brood.phase, brood: [...brood.brood], nextSpit: brood.nextSpit };
    },
    hydrate: (data: BroodSave) => {
      const brood = broodOf(ctx);
      brood.fight = data.fight;
      brood.boss = data.boss;
      brood.phase = data.phase;
      brood.brood = [...data.brood];
      brood.nextSpit = data.nextSpit;
    },
  };
}

export function resetBroodmother(ctx: GameContext): void {
  const brood = broodOf(ctx);
  brood.fight = newBroodFight();
  brood.boss = null;
  brood.phase = null;
  brood.brood = [];
  brood.spit = null;
  brood.tell = null;
}
