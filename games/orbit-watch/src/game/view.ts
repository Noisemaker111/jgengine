import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { tool } from "./hooks";
import { idea } from "./idea";
import { calmLeft, marching, towerOf, towerStats, waveProgress } from "./siege";
import { fact, hold, upgradeCost } from "./spec";

/** Facts the HUD reads, so a screen never digs in the world itself. */
export function holdView(ctx: GameContext) {
  const world = hold.of(ctx);
  const held = tool.read(ctx);
  const wave = world.num(fact("wave"));
  const selected = held.selected === null ? null : world.instance(held.selected);
  const word = selected === null ? null : towerOf(selected.kind);
  const level = selected === null ? 0 : world.num(`${selected.id}.level`) || 1;
  return {
    coin: Math.floor(world.num(fact("coin"))),
    lives: world.num(fact("lives")),
    wave,
    cleared: world.num(fact("cleared")),
    kills: world.num(fact("kills")),
    raiding: world.fact(fact("raiding")) === true,
    calm: calmLeft(ctx),
    marching: marching(ctx),
    progress: waveProgress(ctx),
    won: world.fact(fact("won")) === true,
    lost: world.fact(fact("lost")) === true,
    armed: held.armed,
    towers: world.instances().length,
    building: world.orders("build").length,
    unlocked: idea.towers.map((tower) => ({ id: tower.id, open: tower.from <= Math.max(1, wave) })),
    selected:
      selected === null || word === null
        ? null
        : {
            id: selected.id,
            label: selected.label,
            ready: selected.ready,
            level,
            word,
            stats: towerStats(word, level),
            upgrade: level >= 3 ? null : upgradeCost(word) * level,
            refund: Math.round(word.cost * 0.6),
          },
    mission: world.missionView(),
  };
}
