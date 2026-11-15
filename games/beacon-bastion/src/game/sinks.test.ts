import { describe, expect, test } from "bun:test";

import { keep } from "./keep";
import { gameClockMs, session } from "./session";
import { actionCost, GEAR, gearBoost, gearCost, lotCost, nextLot, openPlots, outageOn, sinkScale, wifiOff } from "./sinks";
import { beaconRunner } from "./testing";
import { tickTowers } from "./combat/towerAI";
import { tickWaves } from "./waves/director";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { TOWER_IDS } from "./entities/towers/catalog";
import { BUILD_PLOTS, SPAWN_POINT_KEY } from "./world/path";
import { restartDefense } from "./world/setup";

/** Play the street for `seconds` the way the balance runs do. */
function advance(runner: HeadlessRunner, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) {
    runner.step(0.1);
    keep.system.update?.(runner.ctx, 0.1);
    tickWaves(runner.ctx, 0.1);
    tickTowers(runner.ctx, 0.1);
  }
}

function rich() {
  const runner = beaconRunner("sinks");
  restartDefense(runner.ctx);
  keep.of(runner.ctx).set("keep.gold", 5000);
  return runner;
}

describe("in-day cash sinks", () => {
  test("every trade has gear, and gear and town actions cost more each wave", () => {
    for (const kind of TOWER_IDS) expect(GEAR[kind]).toBeDefined();
    expect(sinkScale(1)).toBe(1);
    expect(gearCost("worker_barista", 20)).toBeGreaterThan(gearCost("worker_barista", 1) * 3);
    expect(actionCost("outage", 30)).toBeGreaterThan(actionCost("outage", 1) * 4);
  });

  test("gear goes on one worker for twenty seconds and is paid from the till", () => {
    const runner = rich();
    runner.ui.invoke("beacon.place", { kind: "worker_barista", slot: "plot-5" });
    advance(runner, 3);
    const id = keep.of(runner.ctx).occupant("plot-5")!;
    const before = keep.of(runner.ctx).num("keep.gold");
    expect(runner.ui.tryInvoke("town.buy", { gear: id }).status).toBe("applied");
    expect(keep.of(runner.ctx).num("keep.gold")).toBe(before - gearCost("worker_barista"));
    expect(gearBoost(id, gameClockMs(runner.ctx)).rate).toBe(2);
    expect(runner.ui.tryInvoke("town.buy", { gear: id }).status).not.toBe("applied");
    advance(runner, 21);
    expect(gearBoost(id, gameClockMs(runner.ctx)).rate).toBe(1);
  });

  test("a Power Outage stops a road's tech dead; Wi-Fi Off silences routers", () => {
    const runner = rich();
    runner.ui.invoke("wave.send", {});
    advance(runner, 4);
    const creep = [...session.creeps.values()][0]!;
    expect(runner.ui.tryInvoke("town.buy", { action: "outage", route: SPAWN_POINT_KEY }).status).toBe("applied");
    expect(outageOn(SPAWN_POINT_KEY, gameClockMs(runner.ctx))).toBe(true);
    const at = creep.path.distanceTravelled;
    advance(runner, 3);
    expect(session.creeps.get(creep.instanceId)?.path.distanceTravelled).toBe(at);
    expect(runner.ui.tryInvoke("town.buy", { action: "wifi" }).status).toBe("applied");
    expect(wifiOff(gameClockMs(runner.ctx))).toBe(true);
  });

  test("spare lots open one at a time, each half again the last, and only then take a worker", () => {
    const runner = rich();
    const spares = BUILD_PLOTS.filter((plot) => plot.spare);
    expect(spares.length).toBeGreaterThanOrEqual(2);
    expect(openPlots().some((plot) => plot.spare)).toBe(false);
    const first = lotCost();
    expect(runner.ui.tryInvoke("town.buy", { lot: true }).status).toBe("applied");
    expect(openPlots().some((plot) => plot.id === spares[0]!.id)).toBe(true);
    expect(lotCost()).toBe(Math.round(first * 1.5));
    expect(nextLot()?.id).toBe(spares[1]!.id);
    runner.ui.invoke("buildTower1", {});
    expect(runner.ui.tryInvoke("tower.build", { point: spares[0]!.position }).status).toBe("applied");
  });
});
