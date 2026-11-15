import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { livingUnits, session } from "../session";
import { personalityOf } from "./personality";
import { WASP_SORTIE_CAP, WASP_SORTIE_INTERVAL, WASP_SORTIE_SIZE } from "../tuning";

/**
 * The paper wasp nest on the fence: a third party that hates the red colony's foragers. While it
 * hangs there it launches a small sortie on a timer at the nearest red worker (or the red nest), up to
 * a cap on the wing; dig it out and the wasps stop. The nest's own clock lives on the session.
 */

/** Where a sortie flies: the red worker nearest the nest, else the red nest itself. */
export function sortieTarget(ctx: GameContext, from: { x: number; z: number }): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (const unit of livingUnits("player", "unit")) {
    if (unit.catalogId !== "worker") continue;
    const at = ctx.scene.entity.get(unit.id)?.position;
    if (at === undefined) continue;
    const d = Math.hypot(at[0] - from.x, at[2] - from.z);
    if (d < bestD) { bestD = d; best = { x: at[0], z: at[2] }; }
  }
  if (best !== null) return best;
  const nest = livingUnits("player", "building").find((u) => u.catalogId === "keep_player")?.guardPoint;
  return nest ?? null;
}

/** Advance the nest: prune fallen wasps, and launch a sortie when it is due. Returns wasps launched. */
export function tickWaspNest(ctx: GameContext): number {
  const state = session.waspNest;
  const nest = livingUnits("enemy", "building").find((u) => u.catalogId === "wasp_nest");
  state.wing = state.wing.filter((id) => session.units.has(id));
  if (nest === undefined || nest.guardPoint === undefined || session.elapsed < state.nextAt) return 0;
  state.nextAt = session.elapsed + WASP_SORTIE_INTERVAL * personalityOf(session.enemyWave.personality).waspTempo;
  const target = sortieTarget(ctx, nest.guardPoint);
  if (target === null) return 0;
  let launched = 0;
  for (let i = 0; i < WASP_SORTIE_SIZE && state.wing.length < WASP_SORTIE_CAP; i += 1) {
    session.trainSeq += 1;
    const id = `wasp_nest_s${session.trainSeq}`;
    const x = nest.guardPoint.x + (i - 0.5) * 2;
    const z = nest.guardPoint.z + 2;
    ctx.scene.entity.spawn("wasp", { id, position: [x, 0, z], role: "npc" });
    session.units.set(id, { id, catalogId: "wasp", faction: "enemy", kind: "unit", command: { kind: "attackMove", x: target.x, z: target.z }, leash: 0, attackCooldown: 0 });
    state.wing.push(id);
    launched += 1;
  }
  state.launched += launched;
  if (launched > 0) {
    ctx.game.audio.play("wave", [nest.guardPoint.x, 0, nest.guardPoint.z]);
    ctx.game.notices.push({ text: "Paper wasps leave their nest: they hunt your foragers. Spitters reach them; dig out the nest to stop them.", tone: "deny", ttlMs: 7000 });
  }
  return launched;
}
