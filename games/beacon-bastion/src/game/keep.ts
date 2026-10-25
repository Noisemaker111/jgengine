import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldActionDecl, WorldKindDecl, WorldModel, WorldTotalDecl } from "@jgengine/core/worldModel/worldModel";
import { upgradeOptions, upgradePathActions, upgradePathFacts, type UpgradeOption } from "@jgengine/core/worldModel/upgradePaths";
import type { AutoTargetPolicy } from "@jgengine/core/scene/autoTarget";

import { editorLayers } from "../editorLayers";
import { STARTING_GOLD, STARTING_LIVES } from "./entities/base/catalog";
import { TOWER_IDS, towerDef, type TowerDef } from "./entities/towers/catalog";
import { baseTowerFacts, TOWER_FACTS, TOWER_LADDERS, type TowerFact } from "./entities/towers/ladders";
import { finishRun } from "./waves/legacy";
import { BUILD_PLOTS } from "./world/path";
import { session } from "./session";

/**
 * The keep as one declaration: its purse and walls, the nine plots, every tower type with its build
 * time, upgrades and sale, and what kills, leaks and early releases do to it. The engine runs it, so
 * the HUD, the tower panel, the build bar, saves and co-op all read the same world. Creeps on the road,
 * tower aim and the wave director stay real-time game code that reads and writes these facts.
 */

/** Share of everything a tower cost (build and upgrades) that a sale returns. */
export const SELL_SHARE = 0.7;

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
        label: "The Keep",
        facts: {
          gold: { value: STARTING_GOLD, min: 0 },
          lives: { value: STARTING_LIVES, min: 0 },
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
        },
      },
    },
    slots: { plot: Object.fromEntries(BUILD_PLOTS.map((plot) => [plot.id, { position: [plot.position[0], plot.position[2]] as const }])) },
    kinds: Object.fromEntries(defs.map((def) => [def.id, towerKind(def)])),
    actions: Object.assign(
      // The kind's refund (SELL_SHARE) is a share of everything the tower cost, upgrades included.
      { sell: { label: "Sell", on: "tower", removes: true, note: "{target} sold." } },
      aimActions(),
      ...defs.map((def) => upgradePathActions(TOWER_LADDERS[def.id]!)),
    ),
    queues: { build: { lanes: BUILD_PLOTS.length } },
    ripples: {
      bounty: { world: { "keep.gold": 1, "keep.bounty_earned": 1 } },
      overlap_bonus: { world: { "keep.gold": 1 }, note: "An early release paid the keep." },
      leak: { world: { "keep.lives": -1 }, note: "Raiders broke through to the keep.", hook: "keep_breached" },
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
    ctx.scene.entity.spawn(tower.kind, { id: tower.id, position: plot.position, role: "prop" });
  },
  onRemoved(ctx, { id }) {
    ctx.scene.entity.despawn(id);
    session.towerCooldowns.delete(id);
    session.towerShots.delete(id);
    if (session.inspectedTowerId === id) session.inspectedTowerId = null;
  },
  onLanded(ctx, action) {
    if (action === "sell") ctx.game.audio.play("sell");
    else if (action.startsWith("aim_")) ctx.game.audio.play("select");
    else ctx.game.audio.play("upgrade");
  },
});

export const keepOf = (ctx: GameContext): WorldModel => keep.of(ctx);

/** A defense that already fell or held: nothing more is built, released or banked. */
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
}

/** Put every ready tower of the stored world back on the field (after a load). */
export function spawnStandingTowers(ctx: GameContext): void {
  for (const tower of keep.of(ctx).instances()) {
    if (!tower.ready || ctx.scene.entity.get(tower.id) !== null) continue;
    const plot = BUILD_PLOTS.find((candidate) => candidate.id === tower.slot);
    if (plot !== undefined) ctx.scene.entity.spawn(tower.kind, { id: tower.id, position: plot.position, role: "prop" });
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
