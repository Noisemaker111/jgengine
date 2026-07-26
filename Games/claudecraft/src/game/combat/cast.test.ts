import { beforeEach, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { content } from "../content";
import { classById } from "../classes/catalog";
import { heroOf } from "../session/hero";
import { barStore, castStore } from "../session/stores";
import { castSlot, tickHero } from "./engine";

const USER = "caster";
const DT = 1 / 60;

/**
 * Cast timing and move-interruption moved onto `@jgengine/core/combat/castRunner`. These pin the
 * behavior that shipped: a cast completes if you stand still, real movement interrupts it, and
 * sub-threshold jitter does not — the last one being the risk in the migration, since the runner
 * accumulates whatever distance it is handed while the old code compared a single frame's delta.
 */
function bootstrap(): { ctx: GameContext; castTimeSeconds: number; slot: number } {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: USER, isNew: true } });
  game.loop?.onInit?.(ctx);
  game.loop?.onNewPlayer?.(ctx);
  ctx.game.commands.run("class.select", { classId: "priest" });

  // A cast-time HEAL: `castSlot` gates damage and dot abilities on a hostile target, range and line
  // of sight, none of which this test is about. Put it in the first bar slot so the slot is known.
  const heal = classById("priest").abilities.find((entry) => entry.castTime > 0 && entry.kind === "heal");
  if (heal === undefined) throw new Error("priest must have a cast-time heal for this test");
  const bar = [...barStore.read(ctx, USER)];
  bar[0] = heal.id;
  barStore.write(ctx, USER, bar);
  return { ctx, castTimeSeconds: heal.castTime, slot: 0 };
}

function place(ctx: GameContext, x: number, z: number): void {
  const self = ctx.scene.entity.get(USER);
  ctx.scene.entity.setPose(USER, { position: [x, self?.position[1] ?? 0, z] });
}

describe("cast bar", () => {
  let ctx: GameContext;
  let castTimeSeconds: number;
  let slot: number;

  beforeEach(() => {
    ({ ctx, castTimeSeconds, slot } = bootstrap());
  });

  test("the harness really starts a cast", () => {
    expect(castTimeSeconds).toBeGreaterThan(0);
    castSlot(ctx, USER, slot);
    expect(heroOf(ctx, USER)?.caster.casting()).toBe(true);
  });

  test("standing still, a cast runs to completion and clears the bar", () => {
    castSlot(ctx, USER, slot);
    expect(castStore.read(ctx, USER)).not.toBeNull();
    expect(heroOf(ctx, USER)?.caster.casting()).toBe(true);

    // Tick well past the cast time without moving at all.
    const ticks = Math.ceil((castTimeSeconds / DT) * 2) + 10;
    for (let i = 0; i < ticks; i += 1) tickHero(ctx, USER, DT);

    expect(heroOf(ctx, USER)?.caster.casting()).toBe(false);
    expect(castStore.read(ctx, USER)).toBeNull();
  });

  test("walking interrupts the cast", () => {
    castSlot(ctx, USER, slot);
    tickHero(ctx, USER, DT); // seed lastPos
    const before = ctx.scene.entity.get(USER)?.position ?? [0, 0, 0];
    place(ctx, before[0] + 2, before[2]);
    tickHero(ctx, USER, DT);

    expect(heroOf(ctx, USER)?.caster.casting()).toBe(false);
    expect(castStore.read(ctx, USER)).toBeNull();
  });

  test("sub-threshold jitter does NOT interrupt, even accumulated over many frames", () => {
    // Ground-snap noise moves the entity a hair every frame. The runner accumulates distance, so
    // feeding it raw deltas would cancel the cast; the deadzone is what keeps casting usable.
    castSlot(ctx, USER, slot);
    tickHero(ctx, USER, DT);
    const origin = ctx.scene.entity.get(USER)?.position ?? [0, 0, 0];
    const ticks = Math.ceil(castTimeSeconds / DT) - 4;
    for (let i = 0; i < ticks; i += 1) {
      // ±0.01 per frame, well under the 0.04 deadzone, alternating so it never drifts far.
      place(ctx, origin[0] + (i % 2 === 0 ? 0.01 : -0.01), origin[2]);
      tickHero(ctx, USER, DT);
      expect(heroOf(ctx, USER)?.caster.casting()).toBe(true);
    }
  });

  test("a second cast is refused while one is in flight", () => {
    castSlot(ctx, USER, slot);
    const first = castStore.read(ctx, USER);
    castSlot(ctx, USER, slot);
    expect(castStore.read(ctx, USER)).toEqual(first);
  });

  test("the published cast bar spans the ability's cast time", () => {
    castSlot(ctx, USER, slot);
    const state = castStore.read(ctx, USER);
    expect(state).not.toBeNull();
    expect((state?.endAt ?? 0) - (state?.startedAt ?? 0)).toBeCloseTo(castTimeSeconds, 1);
    expect(state?.name.length ?? 0).toBeGreaterThan(0);
  });
});
