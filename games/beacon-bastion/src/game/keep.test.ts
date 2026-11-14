import { beforeEach, describe, expect, test } from "bun:test";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { STARTING_GOLD, STARTING_LIVES } from "./entities/base/catalog";
import { TOWER_CATALOG } from "./entities/towers/catalog";
import { upgradeStepAction } from "@jgengine/core/worldModel/upgradePaths";

import { firepower, keep, sellAction, towerLevel, towerOptions, towersStanding } from "./keep";
import { advanceKeep, beaconRunner } from "./testing";

const barista = TOWER_CATALOG.worker_barista!;
const farmer = TOWER_CATALOG.worker_farmer!;
const cannon = TOWER_CATALOG.worker_construction!;

let runner: HeadlessRunner;
const world = () => keep.of(runner.ctx);
const run = (name: string, input: unknown) => runner.ui.tryInvoke(name, input);
const rank = (kind: string, step: number) => upgradeStepAction(kind, null, step);
const level = (id: string) => towerLevel(world(), id);

beforeEach(() => {
  runner = beaconRunner("Town world");
});

describe("the town is one declaration the engine runs", () => {
  test("hire, wait, stand, refuse a promotion for cash, promote, leak, let go", () => {
    // A construction worker takes their clock-in time: paid and reserved at once, working only once the order finishes.
    expect(run("beacon.place", { kind: "worker_construction", slot: "plot-2" })).toMatchObject({ status: "applied" });
    expect(world().num("keep.gold")).toBe(STARTING_GOLD - cannon.cost);
    expect(world().occupant("plot-2")).toBe("worker_construction-1");
    expect(world().orders("build")[0]).toMatchObject({ label: cannon.label, target: "worker_construction-1" });
    expect(runner.ctx.scene.entity.get("worker_construction-1")).toBeNull();
    advanceKeep(runner, 1.5);
    expect(world().orders("build")[0]?.progress).toBeCloseTo(0.5);
    expect(run("beacon.act", { action: rank("worker_construction", 1), target: "worker_construction-1" })).toMatchObject({ status: "rejected", reason: "busy" });
    advanceKeep(runner, 1.75);
    expect(world().instance("worker_construction-1")?.ready).toBe(true);
    expect(runner.ctx.scene.entity.get("worker_construction-1")).not.toBeNull();
    expect(towersStanding(world())).toBe(1);

    // A barista is instant; then the till is too thin to promote and the refusal says by how much.
    run("beacon.place", { kind: "worker_barista", slot: "plot-1" });
    advanceKeep(runner, 0.25);
    expect(world().num("keep.gold")).toBe(STARTING_GOLD - cannon.cost - barista.cost);
    expect(run("beacon.act", { action: rank("worker_barista", 1), target: "worker_barista-2" })).toEqual({
      status: "rejected",
      reason: "cost",
      message: "Shift Lead needs 33 more gold",
    });
    expect(level("worker_barista-2")).toBe(1);

    // Scrap pay ripples into the till; then the promotion lands and the worker's numbers rise.
    keep.emit(runner.ctx, { kind: "bounty", scale: 40 });
    expect(world().num("keep.bounty_earned")).toBe(40);
    expect(run("beacon.act", { action: rank("worker_barista", 1), target: "worker_barista-2" })).toMatchObject({ status: "applied" });
    expect(level("worker_barista-2")).toBe(2);
    expect(world().num("worker_barista-2.damage")).toBe(barista.damage * 1.5);
    expect(world().num("keep.gold")).toBe(45 - 38);
    expect(firepower(world())).toBe(cannon.damage + barista.damage * 1.5);
    expect(world().costOf(rank("worker_barista", 2), "worker_barista-2")).toEqual({ "keep.gold": -Math.round(barista.cost * 0.75 * 2) });

    // A leak is a ripple on the town's attention span.
    keep.emit(runner.ctx, { kind: "leak", scale: 2 });
    expect(world().num("keep.lives")).toBe(STARTING_LIVES - 2);
    expect(world().log().at(-1)?.text).toBe("Tech got through and the town lost focus.");

    // Letting a worker go pays back a share of the hire and the promotion, frees the plot and despawns them.
    const before = world().num("keep.gold");
    expect(run("beacon.act", { action: sellAction("worker_barista"), target: "worker_barista-2" })).toMatchObject({ status: "applied" });
    expect(world().num("keep.gold")).toBe(before + Math.round((barista.cost + 38) * 0.7));
    expect(world().occupant("plot-1")).toBeNull();
    advanceKeep(runner, 0.25);
    expect(runner.ctx.scene.entity.get("worker_barista-2")).toBeNull();
  });

  test("two shared promotions, then one of two careers: taking one closes the other", () => {
    run("beacon.place", { kind: "worker_farmer", slot: "plot-1" });
    world().set("keep.gold", 10_000);
    run("beacon.act", { action: rank("worker_farmer", 1), target: "worker_farmer-1" });
    run("beacon.act", { action: rank("worker_farmer", 2), target: "worker_farmer-1" });
    expect(level("worker_farmer-1")).toBe(3);
    expect(towerOptions(world(), "worker_farmer-1", "worker_farmer").map((option) => option.branch)).toEqual(["scarecrow", "harvest"]);

    expect(run("beacon.act", { action: upgradeStepAction("worker_farmer", "scarecrow", 1), target: "worker_farmer-1" })).toMatchObject({ status: "applied" });
    expect(world().num("worker_farmer-1.pen")).toBe(20);
    expect(run("beacon.act", { action: upgradeStepAction("worker_farmer", "harvest", 1), target: "worker_farmer-1" })).toMatchObject({ status: "rejected" });
    expect(towerOptions(world(), "worker_farmer-1", "worker_farmer").map((option) => option.label)).toEqual(["Pest Control"]);

    run("beacon.act", { action: upgradeStepAction("worker_farmer", "scarecrow", 2), target: "worker_farmer-1" });
    expect(level("worker_farmer-1")).toBe(5);
    expect(world().num("worker_farmer-1.crit_every")).toBe(4);
    expect(world().num("worker_farmer-1.crit_mult")).toBe(3);
    expect(world().num("worker_farmer-1.air_mult")).toBe(farmer.damage > 0 ? 1 : 0);
    expect(towerOptions(world(), "worker_farmer-1", "worker_farmer")).toEqual([]);
  });

  test("cancelling a hire still clocking in pays all of it back", () => {
    run("beacon.place", { kind: "worker_construction", slot: "plot-3" });
    advanceKeep(runner, 1);
    expect(run("beacon.remove", { id: "worker_construction-1" })).toMatchObject({ status: "applied" });
    expect(world().num("keep.gold")).toBe(STARTING_GOLD);
    advanceKeep(runner, 5);
    expect(runner.ctx.scene.entity.get("worker_construction-1")).toBeNull();
  });

  test("the town losing all focus ends the run once", () => {
    keep.emit(runner.ctx, { kind: "leak", scale: STARTING_LIVES });
    expect(world().fact("keep.fallen")).toBe(true);
    expect(world().fact("keep.banked")).toBe(true);
    keep.emit(runner.ctx, { kind: "leak", scale: 3 });
    expect(world().num("keep.lives")).toBe(0);
  });
});
