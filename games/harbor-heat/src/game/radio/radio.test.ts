import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../../game.config";
import { loop } from "../../loop";
import { content } from "../content";
import { cityEvent } from "../cityRuntime";
import { handrollOf } from "../handroll";
import { RADIO_THEMES } from "./songs";
import { HARBOR_RADIO } from "./stations";
import { bulletinForLog, bulletinForWanted } from "./bulletins";
import { radioOf, radioStore } from "./runtime";

const STEP = 1 / 30;

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "radio-test", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.game.commands.run("game.start", {});
  return ctx;
}

function run(ctx: GameContext, seconds: number): void {
  for (let t = 0; t < seconds; t += STEP) {
    ctx.time.advance(STEP);
    loop.onTick(ctx, STEP);
  }
}

function drive(ctx: GameContext): void {
  const me = ctx.scene.entity.get(ctx.player.userId)!;
  ctx.scene.entity.spawn("car_compact", { id: "radio_car", position: [me.position[0] + 2, me.position[1], me.position[2]], role: "prop" });
  handrollOf(ctx).enterVehicle(ctx, "radio_car");
}

describe("Harbor Heat radio content", () => {
  test("every station segment that names a theme has one, and songs differ in tempo", () => {
    for (const station of HARBOR_RADIO.stations) {
      if (station.bed !== undefined) expect(RADIO_THEMES[station.bed]).toBeDefined();
      for (const segment of station.segments) if (segment.theme !== undefined) expect(RADIO_THEMES[segment.theme]).toBeDefined();
    }
    const tempos = new Set(Object.values(RADIO_THEMES).filter((theme) => theme.id.startsWith("song.")).map((theme) => theme.bpm));
    expect(tempos.size).toBe(5);
  });

  test("each station words the same story its own way", () => {
    const bulletin = bulletinForLog({ kind: "turf:marina:carmine:player", text: "You took the Marina from the Carmines." }, "the Marina")!;
    expect(bulletin.byStation?.mnn?.[0]).toContain("lost control of the Marina");
    expect(bulletin.byStation?.harbor_talk?.[0]).toContain("The Carmines just lost the Marina");
    expect(bulletinForLog({ kind: "turf:flats:player:riptide", text: "" }, "the Low Flats")?.byStation?.harbor_talk?.[0]).toBe("The Riptides took the Low Flats. Of course they did. Nothing changes in this town but the paint.");
    expect(bulletinForLog({ kind: "turf_push:riptide_war", text: "" }, "Canal Row")?.topic).toBe("crew_war");
    expect(bulletinForLog({ kind: "gunfire", text: "" }, null)).toBeNull();
    expect(bulletinForWanted(1, 4, "Canal Row")?.priority).toBe(3);
    expect(bulletinForWanted(3, 0, null)?.topic).toBe("chase_lost");
    expect(bulletinForWanted(2, 3, null)).toBeNull();
  });
});

describe("Harbor Heat radio in play", () => {
  test("plays only from the driver's seat and keeps the station between rides", () => {
    const ctx = boot();
    run(ctx, 0.5);
    expect(radioStore.read(ctx)).toBeNull();
    drive(ctx);
    run(ctx, 0.5);
    expect(radioStore.read(ctx)?.station).toBe("Neon Tide");
    ctx.game.commands.run("radio", {});
    run(ctx, 0.2);
    expect(radioStore.read(ctx)?.frequency).toBe("1040 AM");
    handrollOf(ctx).exitVehicle(ctx, true);
    run(ctx, 0.5);
    expect(radioStore.read(ctx)).toBeNull();
    expect(radioOf(ctx).dial()).toBe("harbor_talk");
    expect(ctx.game.commands.run("radio", {}).status).toBe("rejected");
  });

  test("an officer down in the city breaks into the news station", () => {
    const ctx = boot();
    drive(ctx);
    radioOf(ctx).tune("mnn");
    run(ctx, 0.5);
    cityEvent(ctx, { kind: "cop_down", at: [0, 0, 0], faction: "hhpd" });
    run(ctx, 0.3);
    const now = radioStore.read(ctx)!;
    expect(now.bulletin).toBe(true);
    expect(now.frequency).toBe("88.3 FM");
    expect(radioOf(ctx).station("neon_tide")).not.toBeNull();
  });
});
