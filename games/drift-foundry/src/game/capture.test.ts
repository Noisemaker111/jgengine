import { describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { onInit, onNewPlayer, onTick } from "../loop";
import { stageReadout, stageRun } from "./capture";

const runner = () => createHeadlessRunner({ definition: game.game, content: undefined, loop: { onInit, onNewPlayer, onTick }, maxStepSeconds: 1 });

describe("staged race capture", () => {
  test("midrun is down the corridor with speed on", () => {
    const live = runner();
    stageRun(live.ctx, "midrun");
    const read = stageReadout(live.ctx);
    expect(read.phase).toBe("running");
    expect(read.z).toBeGreaterThan(20);
    expect(read.speedKmh).toBeGreaterThan(0);
  });

  test("result drives to a real ending", () => {
    const live = runner();
    stageRun(live.ctx, "result");
    const read = stageReadout(live.ctx);
    console.log("drift result readout", read);
    expect(read.phase).not.toBe("running");
  });

  test("stages any event's own track: the slag river's time sheet runs on the slag river", () => {
    const live = runner();
    stageRun(live.ctx, "midrun", { event: "time-sheet", seconds: 12 });
    const read = stageReadout(live.ctx);
    expect(read.track).toBe("slag-river");
    expect(read.phase).toBe("running");
    expect(read.run).toBeGreaterThan(60);
  });

  test("reproduces from a fresh boot", () => {
    const first = runner();
    stageRun(first.ctx, "result");
    const read = stageReadout(first.ctx);
    const second = runner();
    stageRun(second.ctx, "result");
    expect(stageReadout(second.ctx)).toEqual(read);
  });
});
