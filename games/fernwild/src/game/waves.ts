import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { pursue } from "@jgengine/core/scene/behaviors";
import type { WorldHookCall } from "@jgengine/core/worldModel/worldModel";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { lairs } from "./places";
import { camp, fact } from "./spec";

const THREAT_IDS = idea.threats.map((threat) => threat.id);

/** True for a live threat entity. */
export const isThreat = (name: string | undefined) => name !== undefined && THREAT_IDS.includes(name);

/** How many come on wave `n`, and which: more each wave, and the bigger ones join as the waves climb. */
export function waveRoster(wave: number): string[] {
  const count = Math.min(3 + (wave - 1) * 3, 36);
  const open = idea.threats.filter((threat) => threat.from <= wave);
  return Array.from({ length: count }, (_, index) => open[(index * 7 + wave) % open.length]!.id);
}

/** The `wave` ripple: the camp's wave counter just went up; send that wave in from the lairs. */
export function spawnWave(ctx: GameContext, call: WorldHookCall): void {
  const wave = call.world.num(fact("wave"));
  const roster = waveRoster(wave);
  const from = lairs(editorLayers);
  roster.forEach((id, index) => {
    const threat = idea.threats.find((entry) => entry.id === id)!;
    const lair = from[index % from.length]!;
    const angle = index * 2.399;
    const x = lair.x + Math.cos(angle) * (2 + (index % 4));
    const z = lair.z + Math.sin(angle) * (2 + (index % 4));
    ctx.scene.entity.spawn(id, {
      id: `${id}-w${wave}-${index}`,
      position: [x, ctx.world.groundHeightAt(x, z), z],
      role: "npc",
      behaviors: [pursue({ aggroRadius: 400, reach: 1.6, leashRange: 4000, speed: threat.speed, attack: { effect: "damage", amount: threat.damage, intervalSec: 1.1 } })],
    });
  });
  call.world.set(fact("alive"), roster.length);
  ctx.game.notices.push({ text: `${idea.wave} ${wave}: ${roster.length} incoming`, tone: "warn" });
}

/** The `dawn` ripple: the wave is held; bank it so a loss goes back here, not to the start. */
export function onDawn(ctx: GameContext, call: WorldHookCall): void {
  ctx.game.notices.push({ text: `${idea.wave} ${call.world.num(fact("held"))} held. Next one in ${idea.calm}s.`, tone: "success" });
  void ctx.game.save?.checkpoint();
}

export function onFallen(ctx: GameContext): void {
  setGamePhase(ctx, "ended");
}

export function onVictory(ctx: GameContext, call: WorldHookCall): void {
  call.world.set(fact("won"), true);
  ctx.game.notices.push({ text: `${idea.home.label} stands. Keep going - it only gets worse.`, tone: "success" });
}

/** `repair` lands on a structure: it is whole again. */
export function repairTarget(ctx: GameContext, call: WorldHookCall): void {
  if (call.target === null) return;
  const health = ctx.scene.entity.stats.get(call.target, "health");
  if (health !== null) ctx.scene.entity.stats.delta(call.target, "health", health.max - health.current);
}

/** `tame_*` lands on a creature: it keeps the player's side and fights what comes for the camp. */
export function tameTarget(ctx: GameContext, call: WorldHookCall): void {
  call.world.change({ [fact("tamed")]: 1 });
  if (call.target !== null) followPlayer(ctx, call.target);
}

/** Make a tamed creature an anchored hunter; safe to call every tick (it only writes on change). */
export function followPlayer(ctx: GameContext, id: string): void {
  const body = ctx.scene.entity.get(id);
  if (body === null) return;
  const current = body.behaviors[0];
  if (current?.kind === "pursue" && current.anchor === ctx.player.userId) return;
  const ally = idea.allies.find((entry) => entry.id === body.name);
  if (ally === undefined) return;
  ctx.scene.entity.update(id, {
    behaviors: [pursue({ aggroRadius: 14, reach: 1.8, leashRange: 22, speed: ally.speed, anchor: ctx.player.userId, hunts: THREAT_IDS, attack: { effect: "damage", amount: ally.damage, intervalSec: 1 } })],
  });
}

export const campOf = (ctx: GameContext) => camp.of(ctx);
