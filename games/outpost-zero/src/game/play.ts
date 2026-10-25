import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineSystem } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";
import { cleared, garrison, guardPost, guardsShoot, isGuard, standing } from "./enemies";
import { gunSystem, rearm, SHOULDER } from "./guns";
import { idea } from "./idea";
import { baseMarker, spawnMarker } from "./places";
import { applyUpgrades, fact, ops } from "./spec";

const BASE = "base";

/** Whether the outposts and the hero need setting up again this frame: the first frame, and after a save loads. */
const pending = perContext((_ctx: GameContext) => ({ rebuild: true, down: false }));

function spawnHero(ctx: GameContext): void {
  const spawn = spawnMarker(editorLayers);
  const at: [number, number, number] = [spawn.position.x, ctx.world.groundHeightAt(spawn.position.x, spawn.position.z), spawn.position.z];
  if (ctx.scene.entity.get(ctx.player.userId) === null) {
    ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: at, rotationY: spawn.rotationY ?? 0, role: "player" });
  } else ctx.scene.entity.setPose(ctx.player.userId, { position: at, rotationY: spawn.rotationY ?? 0 });
  applyUpgrades(ctx);
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health");
  if (health !== null) ctx.scene.entity.stats.delta(ctx.player.userId, "health", health.max - health.current);
}

/** Called once for the local player: the hero at the base, the base itself. */
export function onNewPlayer(ctx: GameContext): void {
  spawnHero(ctx);
  const base = baseMarker(editorLayers).position;
  ctx.scene.entity.spawn(BASE, { id: BASE, position: [base.x, ctx.world.groundHeightAt(base.x, base.z), base.z], rotationY: baseMarker(editorLayers).rotationY ?? 0, role: "prop" });
}

/** A guard fell: pay the bounty, and the whole outpost when it was the last one standing. */
function onGuardDown(ctx: GameContext, id: string): void {
  const post = guardPost(id);
  const enemy = idea.enemies.find((entry) => entry.id === post?.enemy);
  if (post === null || enemy === undefined) return;
  const world = ops.of(ctx);
  world.change({ [fact(idea.currency.id)]: enemy.bounty, [fact("kills")]: 1 });
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `+${enemy.bounty}`, kind: "pickup" });
  if (cleared(ctx, post.outpost) || standing(ctx, post.outpost, id) > 0) return;
  const outpost = idea.outposts.find((entry) => entry.id === post.outpost)!;
  world.set(fact(`${outpost.id}_clear`), true);
  world.change({ [fact("cleared")]: 1, [fact(idea.currency.id)]: outpost.pay });
  ctx.game.notices.push({ text: `${outpost.label} cleared: +${outpost.pay} ${idea.currency.label.toLowerCase()}`, tone: "success" });
  void ctx.game.save?.checkpoint();
}

/** The nearest standing guard, with you 12 m back from it along your facing. */
export function approach(ctx: GameContext): void {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return;
  let best: { id: string; x: number; z: number } | null = null;
  for (const entity of ctx.scene.entity.list()) {
    if (!isGuard(entity.id)) continue;
    const d = Math.hypot(entity.position[0] - me.position[0], entity.position[2] - me.position[2]);
    if (best === null || d < Math.hypot(best.x - me.position[0], best.z - me.position[2])) best = { id: entity.id, x: entity.position[0], z: entity.position[2] };
  }
  if (best === null) return;
  const yaw = me.rotationY;
  // Back along the facing, and left by the camera's shoulder offset so the crosshair ray meets the guard.
  const x = best.x - Math.sin(yaw) * 12 + Math.cos(yaw) * SHOULDER.offset;
  const z = best.z - Math.cos(yaw) * 12 - Math.sin(yaw) * SHOULDER.offset;
  ctx.scene.entity.setPose(ctx.player.userId, { position: [x, ctx.world.groundHeightAt(x, z), z], rotationY: yaw });
}

/** What the HUD reads, so a screen never digs in the world itself. */
export function opsView(ctx: GameContext) {
  const world = ops.of(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  return {
    cash: Math.floor(world.num(fact(idea.currency.id))),
    kills: world.num(fact("kills")),
    cleared: world.num(fact("cleared")),
    won: world.fact(fact("won")) === true,
    down: pending(ctx).down,
    mission: world.missionView(),
    next: world.next(),
    outposts: idea.outposts.map((outpost) => ({
      id: outpost.id,
      label: outpost.label,
      clear: cleared(ctx, outpost.id),
      left: standing(ctx, outpost.id),
      of: outpost.garrison.length,
    })),
    upgrades: idea.upgrades.map((upgrade) => ({ ...upgrade, stage: world.num(`upgrade_${upgrade.id}.stage`) })),
    at: me === null ? null : ([me.position[0], me.position[2]] as const),
  };
}

export const systems = [
  ops.system,
  gunSystem,
  defineSystem({
    id: "shooter.play",
    tick: { type: "frame" },
    save: (ctx) => ({
      key: `${idea.spec}.field`,
      snapshot: () => 1,
      hydrate: () => {
        pending(ctx).rebuild = true;
      },
    }),
    create(ctx) {
      // Drops you 12 m from the nearest guard still standing, along the way you face, so a capture or a
      // drive starts in the fight with the guard under the crosshair.
      ctx.game.commands.define("approach", {
        apply(state) {
          approach(state);
          return state;
        },
      });
      idea.upgrades.forEach((upgrade, index) => {
        ctx.game.commands.define(`upgrade${index + 1}`, {
          apply(state) {
            const done = ops.of(state).act(`upgrade_${upgrade.id}`, `upgrade_${upgrade.id}`);
            if (!done.ok) state.game.notices.push({ text: done.message, tone: "deny" });
            return state;
          },
        });
      });
      ctx.game.events.on("entity.died", (event) => {
        if (event.instanceId === ctx.player.userId) {
          pending(ctx).down = true;
          setGamePhase(ctx, "ended");
        } else if (isGuard(event.instanceId)) onGuardDown(ctx, event.instanceId);
      });
    },
    update(ctx, dt) {
      const state = pending(ctx);
      if (state.rebuild) {
        state.rebuild = false;
        state.down = false;
        spawnHero(ctx);
        rearm(ctx);
        garrison(ctx);
      }
      if (gamePhase(ctx) !== "playing") return;
      guardsShoot(ctx, Math.min(dt, 0.1));
    },
  }),
];
