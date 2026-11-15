import { createWalletBooks, type WalletBooks } from "@jgengine/core/economy/walletBooks";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldActionDecl, WorldKindDecl, WorldModel, WorldTotalDecl } from "@jgengine/core/worldModel/worldModel";
import { upgradeOptions, upgradePathActions, upgradePathFacts, type UpgradeOption } from "@jgengine/core/worldModel/upgradePaths";
import type { AutoTargetPolicy } from "@jgengine/core/scene/autoTarget";

import { ALL_PLOT_IDS, editorLayers } from "../editorLayers";
import { STARTING_GOLD, STARTING_LIVES } from "./entities/base/catalog";
import { TOWER_IDS, towerDef, type TowerDef } from "./entities/towers/catalog";
import { baseTowerFacts, TOWER_FACTS, TOWER_LADDERS, type TowerFact } from "./entities/towers/ladders";
import { PURSE_ACCOUNT, PURSE_CURRENCY, PURSE_FACT, purseReason, purseRef } from "./purse";
import { finishRun } from "./waves/legacy";
import { speak } from "./combat/towerAI";
import { BUILD_PLOTS, facingStreet } from "./world/path";
import { session } from "./session";

/**
 * The town as one declaration: its cash and attention span, the plots along the street, every
 * worker with their clock-in time, promotions and severance, and what kills, leaks and early calls
 * do to it. The engine runs it, so the HUD, the worker card, the hiring board, saves and co-op all
 * read the same world. Tech on the street, worker aim and the wave director stay real-time game code
 * that reads and writes these facts. (Fact ids keep their first names: `keep.gold` is the town's
 * cash and `keep.lives` its attention span.)
 */

/** Share of everything a worker cost (hiring and promotions) that letting them go returns. */
export const SELL_SHARE = 0.7;

/** What one coffee break costs and how much attention it restores. Breaks wait for a clear street. */
export const MEND_RULE = { gold: 20, lives: 1 } as const;

/** One sale for every tower type: the `tower` tag covers them all. */
export const sellAction = (_kind?: string) => "sell";

/** The priorities a tower's aim can be set to, in the order the tablet's button steps through them. */
export const AIM_POLICIES: readonly AutoTargetPolicy[] = ["first", "last", "strongest", "nearest"];
export const aimAction = (policy: AutoTargetPolicy) => `aim_${policy}`;

function towerKind(def: TowerDef): WorldKindDecl {
  return {
    label: def.label,
    tags: ["tower"],
    slot: "plot",
    cost: { "keep.gold": -def.cost },
    ...(def.buildSeconds !== undefined && def.buildSeconds > 0 ? { takes: def.buildSeconds } : {}),
    refund: SELL_SHARE,
    facts: { ...baseTowerFacts(def), ...upgradePathFacts(TOWER_LADDERS[def.id]!), aim: def.targeting },
  };
}

function aimActions(): Record<string, WorldActionDecl> {
  return Object.fromEntries(
    AIM_POLICIES.map((policy) => [aimAction(policy), { label: `Aim: ${policy}`, on: "tower", effect: { aim: policy } } satisfies WorldActionDecl]),
  );
}

const defs = TOWER_IDS.map((id) => towerDef(id, editorLayers));
const totals: Record<string, WorldTotalDecl> = {
  "keep.towers": { of: "tower" },
  "keep.firepower": { of: "tower", sum: "damage" },
};

export const keep = defineGameSpec({
  id: "beacon",
  world: {
    factions: {
      keep: {
        label: "The Town",
        facts: {
          gold: { value: STARTING_GOLD, min: 0, label: "cash" },
          lives: { value: STARTING_LIVES, min: 0, label: "attention" },
          lives_max: STARTING_LIVES,
          /** The wave the director has open (0 before the first release). */
          wave: 0,
          wave_ready: true,
          wave_started: false,
          last_bonus: 0,
          bounty_earned: 0,
          banked: false,
          fallen: false,
          held: false,
          /** Stars the finished defense earned (0 until it ends, and for a fall). */
          stars: 0,
          /** Where a finished Overtime night landed on the career's board (0: missed it, or not Overtime). */
          board_place: 0,
          /** Lives lost and not yet mended. */
          breaches: { value: 0, min: 0 },
          /** Lives lost since the last held-wave pay. */
          wave_leaks: { value: 0, min: 0 },
          /** The last wave the garrison was paid for. */
          paid_wave: 0,
          /** The newest wave has fully arrived and no raider is on the road. */
          field_clear: true,
        },
      },
    },
    // One slot per plot id across every map; the live map's plots are where workers actually stand.
    slots: { plot: Object.fromEntries(ALL_PLOT_IDS.map((id) => {
      const plot = BUILD_PLOTS.find((candidate) => candidate.id === id);
      return [id, { position: plot === undefined ? [0, 0] as const : [plot.position[0], plot.position[2]] as const }];
    })) },
    kinds: Object.fromEntries(defs.map((def) => [def.id, towerKind(def)])),
    actions: Object.assign(
      // The kind's refund (SELL_SHARE) is a share of everything the tower cost, upgrades included.
      { sell: { label: "Let go", on: "tower", removes: true, note: "{target} clocked out for good." } },
      {
        mend: {
          label: "Coffee break",
          when: { "keep.field_clear": true, "keep.breaches": { atLeast: MEND_RULE.lives } },
          cost: { "keep.gold": -MEND_RULE.gold },
          world: { "keep.lives": MEND_RULE.lives, "keep.breaches": -MEND_RULE.lives },
          refuse: "Take a coffee break once the street is clear",
        },
      },
      aimActions(),
      ...defs.map((def) => upgradePathActions(TOWER_LADDERS[def.id]!)),
    ),
    queues: { build: { lanes: ALL_PLOT_IDS.length } },
    ripples: {
      bounty: { world: { "keep.gold": 1, "keep.bounty_earned": 1 } },
      overlap_bonus: { world: { "keep.gold": 1 }, note: "An early release paid the keep." },
      leak: { world: { "keep.lives": -1, "keep.breaches": 1, "keep.wave_leaks": 1 }, note: "Tech got through and the town lost focus.", hook: "keep_breached" },
      held_pay: { world: { "keep.gold": 1 }, note: "The town paid its workers for a clear street." },
      mail_pay: { world: { "keep.gold": 1 }, note: "The mail came in." },
      theft: { world: { "keep.gold": -1 }, note: "A mining rig siphoned the town's cash." },
      spend: { world: { "keep.gold": -1 }, note: "The town spent cash on gear, a town action or a new lot." },
    },
    totals,
  },
  hooks: {
    keep_breached(ctx, call) {
      if (call.world.num("keep.lives") > 0 || runEnded(call.world)) return;
      call.world.set("keep.fallen", true);
      finishRun(ctx);
      setGamePhase(ctx, "ended");
      ctx.game.audio.play("defeat");
    },
  },
  onReady(ctx, tower) {
    const plot = BUILD_PLOTS.find((candidate) => candidate.id === tower.slot);
    if (plot === undefined) return;
    ctx.scene.entity.spawn(tower.kind, { id: tower.id, position: plot.position, role: "prop", rotationY: facingStreet(plot.position) });
    speak(ctx, tower.id, tower.kind, "place");
  },
  onRemoved(ctx, { id }) {
    ctx.scene.entity.despawn(id);
    session.towerCooldowns.delete(id);
    session.towerShots.delete(id);
    session.workerClocks.delete(id);
    session.workers.clear(id);
    if (session.inspectedTowerId === id) session.inspectedTowerId = null;
  },
  // Every move of the purse (a build, an upgrade, a sale, a bounty, held pay) goes into the keep's books.
  watch: {
    facts: [PURSE_FACT],
    onChange(ctx, change) {
      keepBooks(ctx).record(PURSE_CURRENCY, change.to - change.from, purseReason(change.cause), purseRef(change.cause));
    },
  },
  onLanded(ctx, action, target) {
    if (action === "sell") ctx.game.audio.play("sell");
    else if (action.startsWith("aim_")) ctx.game.audio.play("select");
    else {
      ctx.game.audio.play("upgrade");
      const worker = target === null ? null : keep.of(ctx).instance(target);
      if (worker !== null) {
        speak(ctx, worker.id, worker.kind, "promote");
        ctx.game.playEntityAnimation(worker.id, "cheer");
      }
    }
  },
});

export const keepOf = (ctx: GameContext): WorldModel => keep.of(ctx);

/**
 * The keep's books: the shared transaction ledger kept square to `keep.gold`, with every movement's
 * reason. A fresh keep opens them with its opening purse, so the history explains the whole balance.
 */
export const keepBooks = perContext((ctx: GameContext): WalletBooks => createWalletBooks({
  account: PURSE_ACCOUNT,
  currencies: [PURSE_CURRENCY],
  balance: () => keep.of(ctx).num(PURSE_FACT),
  now: () => ctx.time.now(),
  opening: "opening-purse",
}));

/** A defense that was already lost or held: nothing more is hired, released or banked. */
export function runEnded(world: WorldModel): boolean {
  return world.fact("keep.fallen") === true || world.fact("keep.held") === true;
}

/** Ready towers standing, every type. */
export function towersStanding(world: WorldModel): number {
  return world.num("keep.towers");
}

/** Damage per shot summed over every ready tower. */
export function firepower(world: WorldModel): number {
  return world.num("keep.firepower");
}

/** A tower's rank: 1 when built, one more per step it has taken on its ladder (5 at the top). */
export function towerLevel(world: WorldModel, id: string): number {
  return 1 + world.num(`${id}.tier`) + world.num(`${id}.branch_tier`);
}

/** The highest rank a tower reaches: built, two shared ranks, two on its path. */
export const MAX_TOWER_LEVEL = 5;

export type TowerStats = Record<TowerFact, number> & {
  level: number;
  fireRateHz: number;
  splashRadius: number;
  branch: string | null;
  aim: AutoTargetPolicy;
};

/** One tower's live numbers, as the world holds them. */
export function towerStats(world: WorldModel, id: string): TowerStats {
  const facts = Object.fromEntries(TOWER_FACTS.map((fact) => [fact, world.num(`${id}.${fact}`)])) as Record<TowerFact, number>;
  const branch = world.fact(`${id}.branch`);
  const aim = world.fact(`${id}.aim`);
  return {
    ...facts,
    level: towerLevel(world, id),
    fireRateHz: facts.rate,
    splashRadius: facts.splash,
    branch: typeof branch === "string" && branch !== "" ? branch : null,
    aim: typeof aim === "string" && (AIM_POLICIES as readonly string[]).includes(aim) ? (aim as AutoTargetPolicy) : "first",
  };
}

/** The steps a tower can take next on its ladder, priced and checked by the keep's world. */
export function towerOptions(world: WorldModel, id: string, kind: string): UpgradeOption[] {
  const ladder = TOWER_LADDERS[kind];
  return ladder === undefined ? [] : upgradeOptions(world, ladder, id);
}

/** Gold a tower costs to build, as the declaration prices it. */
export function buildCost(kind: string): number {
  return -((keep.def.kinds?.[kind]?.cost?.["keep.gold"] as number | undefined) ?? 0);
}

/** Gold a cost would take, as a positive number (`costOf` reports spends as negatives). */
export function goldCost(world: WorldModel, action: string, target?: string): number {
  return -(world.costOf(action, target)["keep.gold"] as number | undefined ?? 0);
}

/** What selling a tower returns right now: its share of the build and every upgrade it took. */
export function sellValue(world: WorldModel, id: string, _kind?: string): number {
  return Math.round(world.num(`${id}.spent`) * SELL_SHARE);
}

/** Wipe the field back to a fresh keep, opening with the purse and walls the relic and bank allow. */
export function resetKeep(ctx: GameContext, opening: { gold: number; lives: number }): void {
  for (const tower of keep.of(ctx).instances()) ctx.scene.entity.despawn(tower.id);
  keep.store.write(ctx, undefined);
  const world = keep.of(ctx);
  world.set("keep.gold", opening.gold);
  world.set("keep.lives", opening.lives);
  world.set("keep.lives_max", opening.lives);
  keepBooks(ctx).reset("opening-purse");
}

/** Put every ready worker of the stored world back on their plot (after a load). */
export function spawnStandingTowers(ctx: GameContext): void {
  for (const tower of keep.of(ctx).instances()) {
    if (!tower.ready || ctx.scene.entity.get(tower.id) !== null) continue;
    const plot = BUILD_PLOTS.find((candidate) => candidate.id === tower.slot);
    if (plot !== undefined) ctx.scene.entity.spawn(tower.kind, { id: tower.id, position: plot.position, role: "prop", rotationY: facingStreet(plot.position) });
  }
}

/**
 * Dev-only: the readout a drive asserts against (the keep's facts, towers, builds, refusals) and
 * `beacon.dev.try`, which runs a command a drive expects to be refused without failing the step.
 */
export function exposeKeepReadout(ctx: GameContext, phase: () => string): void {
  if (!import.meta.env?.DEV) return;
  const refused: string[] = [];
  ctx.game.events.on("command.refused", (event) => {
    if (event.message !== undefined) refused.push(event.message);
  });
  ctx.game.commands.define<{ name: string; input?: unknown }>("beacon.dev.try", {
    apply(state, input) {
      state.game.commands.run(input.name, input.input ?? {});
      return state;
    },
  });
  (globalThis as { __beacon?: unknown }).__beacon = {
    read() {
      const world = keep.of(ctx);
      return {
        phase: phase(),
        gold: world.num("keep.gold"),
        lives: world.num("keep.lives"),
        wave: world.num("keep.wave"),
        waveReady: world.fact("keep.wave_ready") === true,
        bounty: world.num("keep.bounty_earned"),
        fallen: world.fact("keep.fallen") === true,
        held: world.fact("keep.held") === true,
        standing: towersStanding(world),
        firepower: firepower(world),
        creeps: session.creeps.size,
        inspected: session.inspectedTowerId,
        towers: Object.fromEntries(world.instances().map((tower) => [tower.id, { kind: tower.kind, slot: tower.slot, ready: tower.ready, level: towerLevel(world, tower.id), branch: world.fact(`${tower.id}.branch`), aim: world.fact(`${tower.id}.aim`) }])),
        orders: world.orders().map((order) => ({ label: order.label, target: order.target, progress: order.progress })),
        log: world.log().map((entry) => entry.text),
        notices: ctx.game.notices.list().map((notice) => notice.text),
        refused: [...refused],
      };
    },
  };
}
