import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { gunIntervalScale } from "../progression/upgrades";
import { weaponTriggers } from "./use-handlers";
import { weaponById } from "./weapons/catalog";

const HERO = "trigger-hero";

interface Rig {
  ctx: GameContext;
  shots: string[];
  projectiles: number;
  warnings: string[];
  fire(itemId: string): void;
  wait(seconds: number): void;
  ammo(stat: string): number;
}

function rig(): Rig {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: HERO, isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  // The world boots paused behind the title; the street clock runs once play starts.
  ctx.time.play();
  const out: Rig = {
    ctx,
    shots: [],
    projectiles: 0,
    warnings: [],
    fire: (itemId) => ctx.item.use.use({ from: HERO, itemId, aim: { yaw: 0, pitch: 0 } }),
    wait: (seconds) => ctx.time.advance(seconds),
    ammo: (stat) => ctx.scene.entity.stats.get(HERO, stat)?.current ?? Number.NaN,
  };
  const fireProjectile = ctx.scene.entity.fireProjectile.bind(ctx.scene.entity);
  ctx.scene.entity.fireProjectile = (input) => {
    out.projectiles += 1;
    return fireProjectile(input);
  };
  weaponTriggers(ctx).onShot((shot) => out.shots.push(`${shot.weapon}#${shot.shot}`));
  ctx.game.events.on("entity.floatText", (event) => {
    if (event.instanceId === HERO) out.warnings.push(event.text);
  });
  return out;
}

describe("harbor-heat weapon triggers", () => {
  test("a pistol spends its ammo stat one round a shot, at its cadence, and says so when dry", () => {
    const r = rig();
    const interval = (weaponById("pistol_vice")!.fireIntervalMs * gunIntervalScale(r.ctx)) / 1000;
    r.ctx.scene.entity.stats.set(HERO, "ammo_9mm", { current: 3 });
    const counts: number[] = [];
    r.fire("pistol_vice");
    counts.push(r.ammo("ammo_9mm"));
    // Inside the interval: the trigger waits, the round stays.
    r.fire("pistol_vice");
    counts.push(r.ammo("ammo_9mm"));
    for (let i = 0; i < 3; i += 1) {
      r.wait(interval + 0.001);
      r.fire("pistol_vice");
      counts.push(r.ammo("ammo_9mm"));
    }
    expect(counts).toEqual([2, 2, 1, 0, 0]);
    expect(r.shots).toEqual(["pistol_vice#1", "pistol_vice#2", "pistol_vice#3"]);
    expect(r.projectiles).toBe(3);
    expect(r.warnings).toEqual(["OUT OF AMMO"]);

    // A dry trigger repeats the warning at the gun's cadence, not every pull.
    r.fire("pistol_vice");
    expect(r.warnings).toEqual(["OUT OF AMMO"]);
    r.wait(interval + 0.001);
    r.fire("pistol_vice");
    expect(r.warnings).toEqual(["OUT OF AMMO", "OUT OF AMMO"]);

    // A box of rounds lands in the same stat the trigger reads.
    r.ctx.scene.entity.stats.delta(HERO, "ammo_9mm", 2);
    r.wait(interval + 0.001);
    r.fire("pistol_vice");
    expect(r.ammo("ammo_9mm")).toBe(1);
    expect(r.shots.at(-1)).toBe("pistol_vice#4");
  });

  test("each gun keeps its own cadence and ammo type; an empty shotgun never presents a shot", () => {
    const r = rig();
    r.ctx.scene.entity.stats.set(HERO, "ammo_9mm", { current: 10 });
    r.ctx.scene.entity.stats.set(HERO, "ammo_shell", { current: 0 });
    r.fire("pistol_vice");
    r.fire("smg_carmine");
    r.fire("shotgun_boardwalk");
    expect(r.shots).toEqual(["pistol_vice#1", "smg_carmine#1"]);
    expect(r.ammo("ammo_9mm")).toBe(8);
    expect(r.warnings).toEqual(["OUT OF AMMO"]);
    r.ctx.scene.entity.stats.set(HERO, "ammo_shell", { current: 1 });
    r.wait(weaponById("shotgun_boardwalk")!.fireIntervalMs / 1000 + 0.001);
    r.fire("shotgun_boardwalk");
    expect(r.shots.at(-1)).toBe("shotgun_boardwalk#1");
    expect(r.ammo("ammo_shell")).toBe(0);
    expect(r.projectiles).toBe(3);
  });
});
