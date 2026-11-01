import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { roadSource } from "./cityLayout";
import { isNightHour, tickNightLook } from "./nightLook";

function boot() {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "night-test", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}

const pools = (ctx: ReturnType<typeof boot>): number => ctx.scene.object.list().filter((object) => object.catalogId === "obj_lamp_pool").length;

describe("night look", () => {
  test("dusk to before dawn is night", () => {
    expect([0, 3, 5.4, 19, 23].every(isNightHour)).toBe(true);
    expect([5.5, 12, 18.9].some(isNightHour)).toBe(false);
  });

  test("lamps throw a pool of light and the roads wet at night, and both dry at dawn", () => {
    const ctx = boot();
    ctx.time.hydrate({ ...ctx.time.snapshot(), now: 700 });
    tickNightLook(ctx);
    const night = pools(ctx);
    expect(night).toBeGreaterThan(20);
    expect(roadSource.current()[0]?.materials?.road?.maps.color).toContain("asphalt025c");
    ctx.time.hydrate({ ...ctx.time.snapshot(), now: 360 });
    tickNightLook(ctx);
    expect(pools(ctx)).toBe(0);
    expect(roadSource.current()[0]?.materials?.road?.maps.color).toContain("asphalt012");
  });
});
