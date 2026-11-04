import { beforeEach, describe, expect, test } from "bun:test";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { keep, MEND_RULE } from "../keep";
import { session } from "../session";
import { beaconRunner } from "../testing";
import { tickWaves } from "./director";
import { HELD_PAY_RULE, heldPay, interestOn } from "./heldWavePay";

let runner: HeadlessRunner;
const world = () => keep.of(runner.ctx);

beforeEach(() => {
  runner = beaconRunner("Beacon held pay");
});

/** Release a wave and tick until it has fully arrived. */
function release(): void {
  runner.ui.invoke("wave.send", {});
  for (let t = 0; t < 60 && world().fact("keep.wave_ready") !== true; t += 0.5) tickWaves(runner.ctx, 0.5);
  expect(world().fact("keep.wave_ready")).toBe(true);
}

function killAll(): void {
  for (const id of [...session.creeps.keys()]) runner.ctx.scene.entity.effect({ from: "test", to: id, effect: "damage", via: { amount: 100_000 } });
}

/** Let every raider on the road walk into the keep, holding the clock so the next wave stays home. */
function leakAll(): void {
  for (let t = 0; t < 240 && session.creeps.size > 0; t += 0.5) {
    session.countdown.disarm();
    tickWaves(runner.ctx, 0.5);
  }
}

describe("held-wave pay", () => {
  test("wages rise with the wave, interest is a capped share of the purse, whole walls pay a bonus", () => {
    const pay = heldPay(2, 3, 120, 0);
    expect(pay.wages).toBe(2 * HELD_PAY_RULE.wageBase + HELD_PAY_RULE.wagePerWave * 5);
    expect(pay.interest).toBe(12);
    expect(pay.flawless).toBe(HELD_PAY_RULE.flawless);
    expect(heldPay(1, 1, 5000, 2)).toMatchObject({ interest: HELD_PAY_RULE.interestMax, flawless: 0 });
    expect(interestOn(199)).toBe(19);
  });

  test("clearing the road after a wave pays it once, with interest on what the purse held", () => {
    release();
    killAll();
    const held = world().num("keep.gold");
    tickWaves(runner.ctx, 0.1);
    const expected = heldPay(1, 1, held, 0).total;
    expect(world().num("keep.gold")).toBe(held + expected);
    expect(world().num("keep.paid_wave")).toBe(1);
    expect(runner.ctx.game.notices.list().some((notice) => notice.text.startsWith("Wave 1 held"))).toBe(true);
    tickWaves(runner.ctx, 1);
    expect(world().num("keep.gold")).toBe(held + expected);
  });

  test("a wave called early is still paid when the road next clears", () => {
    release();
    killAll();
    tickWaves(runner.ctx, 0.1);
    release();
    runner.ui.invoke("wave.send", {});
    killAll();
    for (let t = 0; t < 60 && world().fact("keep.wave_ready") !== true; t += 0.5) {
      tickWaves(runner.ctx, 0.5);
      killAll();
    }
    tickWaves(runner.ctx, 0.1);
    expect(world().num("keep.paid_wave")).toBe(3);
    const notices = runner.ctx.game.notices.list().map((notice) => notice.text);
    expect(notices.some((text) => text.startsWith("Wave 3 held"))).toBe(true);
    expect(notices.some((text) => text.startsWith("Wave 2 held"))).toBe(false);
  });

  test("a leak costs the flawless bonus and leaves a breach the masons can mend once the road is clear", () => {
    release();
    const lives = world().num("keep.lives");
    const before = world().num("keep.gold");
    leakAll();
    const lost = lives - world().num("keep.lives");
    expect(lost).toBeGreaterThan(0);
    expect(world().num("keep.breaches")).toBe(lost);
    expect(world().num("keep.gold") - before).toBe(heldPay(1, 1, before, lost).total);
    expect(world().num("keep.wave_leaks")).toBe(0);

    const gold = world().num("keep.gold");
    runner.ui.invoke("mendWalls", {});
    expect(world().num("keep.lives")).toBe(lives - lost + MEND_RULE.lives);
    expect(world().num("keep.breaches")).toBe(lost - MEND_RULE.lives);
    expect(world().num("keep.gold")).toBe(gold - MEND_RULE.gold);
  });

  test("the walls can't be mended with raiders on the road, past whole, or without the gold", () => {
    expect(runner.ui.tryInvoke("mendWalls", {}).status).not.toBe("applied");
    release();
    leakAll();
    runner.ui.invoke("wave.send", {});
    tickWaves(runner.ctx, 2);
    expect(session.creeps.size).toBeGreaterThan(0);
    expect(world().canAct("mend")).not.toBeNull();
    expect(runner.ui.tryInvoke("mendWalls", {}).status).not.toBe("applied");
    killAll();
    for (let t = 0; t < 60 && world().fact("keep.field_clear") !== true; t += 0.5) {
      tickWaves(runner.ctx, 0.5);
      killAll();
    }
    world().set("keep.gold", MEND_RULE.gold - 1);
    expect(runner.ui.tryInvoke("mendWalls", {}).status).not.toBe("applied");
    world().set("keep.gold", 10_000);
    while (world().num("keep.breaches") > 0) runner.ui.invoke("mendWalls", {});
    expect(world().num("keep.lives")).toBe(world().num("keep.lives_max"));
    expect(runner.ui.tryInvoke("mendWalls", {}).status).not.toBe("applied");
  });
});
