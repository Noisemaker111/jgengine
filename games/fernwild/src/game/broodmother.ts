import { advanceBoss, createBossState, type BossState } from "@jgengine/core/ai/director/boss";
import { arenaWall, createBossArena, type ArenaCandidate, type BossArena, type BossArenaState } from "@jgengine/core/bossArena/bossArena";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { teleportPlayer } from "@jgengine/core/movement/teleport";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { ridingOf } from "@jgengine/core/scene/riding";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../editorLayers";
import { BAG, HOTBAR } from "./bags";
import { creatureAlive, creatureHealth, moveCreature, removeCreatureNow, slayCreature, spawnCreature, tames } from "./creatures";
import { BROOD_LAIR, BROOD_PHASES, BROOD_TIERS, broodTier, PORTAL_RANGE, SPIT } from "./data/bosses";
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

interface Brood {
  arena: BossArena;
  /** The Broodmother's creature id while she is in the lair. */
  boss: string | null;
  phase: BossState | null;
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
  return { arena: createBossArena({ tiers: BROOD_TIERS }), boss: null, phase: null, brood: [], nextSpit: 0, spit: null, tell: null };
});

/** The lair's ring wall, standing on its islet. */
export function lairWall(ctx: GameContext) {
  return arenaWall({ center: BROOD_LAIR.center, radius: BROOD_LAIR.radius, height: BROOD_LAIR.wallHeight, thickness: 5, sides: 36, ground: ctx.world.groundHeightAt });
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
  if (!nearTerminal(ctx) || broodOf(ctx).arena.state().phase !== "idle") return [];
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
  const result = broodOf(ctx).arena.summon(tier.id, { count: (item) => carried(ctx, item), take: (item, count) => void takeAnywhere(ctx, item, count) }, survivorLevel(ctx), ctx.time.now());
  if (!result.ok) {
    const check = result.check;
    const why = result.reason === "busy" ? "The Broodmother is already summoned" : check !== undefined && check.levelShort > 0 ? `Requires level ${tier.minLevel}` : `Missing ${check?.missing.map((entry) => `${entry.need - entry.have} ${itemLabel(entry.item)}`).join(", ") ?? "tribute"}`;
    ctx.game.notices.push({ text: why, tone: "deny" });
    return;
  }
  setScreen(ctx, null);
  ctx.game.notices.push({ text: `${tier.label} Broodmother summoned. The portal opens in ${Math.round(broodOf(ctx).arena.secondsLeft(ctx.time.now()) ?? 0)} seconds: stay near the obelisk with your tames.`, tone: "success" });
}

/** What the terminal screen lists: each difficulty, its level and tribute against what the survivor carries. */
export function obeliskView(ctx: GameContext) {
  const level = survivorLevel(ctx);
  const arena = broodOf(ctx).arena;
  return {
    busy: arena.state().phase !== "idle",
    tiers: BROOD_TIERS.map((tier) => {
      const check = arena.check(tier.id, (item) => carried(ctx, item), level);
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
function gather(ctx: GameContext): ArenaCandidate[] {
  const obelisk = greenObelisk(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null || flat(me.position, obelisk) > PORTAL_RANGE) return [];
  const out: ArenaCandidate[] = [{ id: ctx.player.userId, kind: "survivor", at: [me.position[0], me.position[1], me.position[2]] }];
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

function enter(ctx: GameContext, brood: Brood, tierId: string, admitted: readonly ArenaCandidate[], refused: number): void {
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
  brood.phase = createBossState(BROOD_PHASES);
  // She greets them with a spit before she closes in.
  brood.nextSpit = ctx.time.now() + FIRST_SPIT;
  callBrood(ctx, brood, BROOD_PHASES[0]!.brood);
  const left = refused > 0 ? ` ${refused} could not come through.` : "";
  ctx.game.notices.push({ text: `The ${tier.label} Broodmother's lair. Kill her!${left}`, tone: "deny" });
}

function fight(ctx: GameContext, brood: Brood, dt: number): void {
  const now = ctx.time.now();
  const arena = brood.arena;
  const me = ctx.scene.entity.get(ctx.player.userId);
  // A survivor no longer in the lair (dead, back on the beach) has left the fight; so has a tame that died.
  if (arena.inside(ctx.player.userId) && (me === null || !inLair(me.position))) arena.leave(ctx.player.userId);
  for (const id of arena.state().companions) if (!creatureAlive(ctx, id)) arena.leave(id);
  const health = brood.boss === null ? null : creatureHealth(ctx, brood.boss);
  if (health === null || brood.phase === null || arena.state().phase !== "fight") return;
  const step = advanceBoss(BROOD_PHASES, brood.phase, health, dt);
  brood.phase = step.state;
  if (step.tell !== null) {
    brood.tell = { text: step.tell.id, until: now + (step.tell.telegraphSeconds ?? 1.5) };
    ctx.game.notices.push({ text: step.tell.id, tone: "deny" });
  }
  const phase = BROOD_PHASES[step.state.phase]!;
  if (step.changed) callBrood(ctx, brood, phase.brood);
  const boss = ctx.scene.entity.get(brood.boss!);
  if (now >= brood.nextSpit && boss !== null && me !== null && arena.inside(ctx.player.userId)) {
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
export function tickBroodmother(ctx: GameContext, dt: number): void {
  const brood = broodOf(ctx);
  const now = ctx.time.now();
  if (brood.tell !== null && brood.tell.until <= now) brood.tell = null;
  if (brood.arena.state().phase === "fight") fight(ctx, brood, dt);
  const events = brood.arena.tick(now, { bossAlive: () => brood.boss !== null && creatureAlive(ctx, brood.boss), gather: () => gather(ctx) });
  for (const event of events) {
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
  const state = brood.arena.state();
  const now = ctx.time.now();
  const tier = state.tier === null ? null : broodTier(state.tier);
  return {
    phase: state.phase,
    tier: tier?.label ?? null,
    secondsLeft: brood.arena.secondsLeft(now),
    inside: brood.arena.inside(ctx.player.userId),
    boss: brood.boss === null ? null : { id: brood.boss, health: creatureHealth(ctx, brood.boss) ?? 0, phase: brood.phase?.phaseId ?? null },
    brood: brood.brood.filter((id) => creatureAlive(ctx, id)).length,
    tell: brood.tell?.text ?? null,
    survivors: state.survivors.length,
    companions: state.companions.length,
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
  arena: BossArenaState;
  boss: string | null;
  phase: BossState | null;
  brood: string[];
  nextSpit: number;
}

export function broodSave(ctx: GameContext) {
  return {
    key: "fernwild.broodmother",
    snapshot: (): BroodSave => {
      const brood = broodOf(ctx);
      return { arena: brood.arena.snapshot(), boss: brood.boss, phase: brood.phase, brood: [...brood.brood], nextSpit: brood.nextSpit };
    },
    hydrate: (data: BroodSave) => {
      const brood = broodOf(ctx);
      brood.arena.restore(data.arena);
      brood.boss = data.boss;
      brood.phase = data.phase;
      brood.brood = [...data.brood];
      brood.nextSpit = data.nextSpit;
    },
  };
}

export function resetBroodmother(ctx: GameContext): void {
  const brood = broodOf(ctx);
  brood.arena.reset();
  brood.boss = null;
  brood.phase = null;
  brood.brood = [];
  brood.spit = null;
  brood.tell = null;
}
