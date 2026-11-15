import { describe, expect, test } from "bun:test";

import { campaign, freshCampaign, readCampaign } from "./campaign";
import { TOWER_IDS } from "./entities/towers/catalog";
import { keep } from "./keep";
import { beaconRunner } from "./testing";
import {
  buyUnion, distractionShare, duesFor, earnDues, HIRE_DUES, hiredTrades, isHired, STARTER_CREW, unionDamage, unionOpening, unionReach, unionRefusal,
} from "./union";
import { openingKeep } from "./waves/legacy";
import { restartDefense } from "./world/setup";

describe("the union hall", () => {
  test("a new career hires four trades; every other trade costs dues to bring in", () => {
    const state = freshCampaign();
    expect(hiredTrades(state)).toEqual(TOWER_IDS.filter((kind) => STARTER_CREW.includes(kind)));
    expect(STARTER_CREW.length + Object.keys(HIRE_DUES).length).toBe(TOWER_IDS.length);
    expect(isHired(state, "worker_lawyer")).toBe(false);
    expect(unionRefusal(state, { hire: "worker_lawyer" })).toContain("more dues");
  });

  test("the build bar refuses a trade the union has not hired, and takes it once hired", () => {
    const runner = beaconRunner("union");
    expect(runner.ui.tryInvoke("buildTower14", {}).status).not.toBe("applied");
    earnDues(runner.ctx, HIRE_DUES.worker_lawyer!);
    expect(runner.ui.tryInvoke("union.buy", { hire: "worker_lawyer" }).status).toBe("applied");
    expect(campaign.read(runner.ctx).union.dues).toBe(0);
    expect(runner.ui.tryInvoke("buildTower14", {}).status).toBe("applied");
  });

  test("a finished day pays dues: waves, stars, and a bonus for a held street", () => {
    expect(duesFor(false, 4, 0)).toBe(8);
    expect(duesFor(true, 12, 3)).toBe(49);
    expect(duesFor(true, 12, 3)).toBeGreaterThan(duesFor(false, 12, 0));
  });

  test("training, landlines, the library card and the town upgrades each change the day", () => {
    const runner = beaconRunner("union effects");
    earnDues(runner.ctx, 500);
    const before = openingKeep(runner.ctx);
    expect(buyUnion(runner.ctx, { train: "worker_barista" })).toBe(true);
    expect(buyUnion(runner.ctx, { town: "landlines" })).toBe(true);
    expect(buyUnion(runner.ctx, { town: "library_card" })).toBe(false);
    expect(buyUnion(runner.ctx, { hire: "worker_librarian" })).toBe(true);
    expect(buyUnion(runner.ctx, { town: "library_card" })).toBe(true);
    expect(buyUnion(runner.ctx, { town: "block_party" })).toBe(true);
    expect(buyUnion(runner.ctx, { town: "bike_couriers" })).toBe(true);
    const state = campaign.read(runner.ctx);
    expect(unionDamage(state, "worker_barista")).toBeCloseTo(1.1);
    expect(unionDamage(state, "worker_librarian")).toBeCloseTo(1.25);
    expect(unionReach(state, "worker_librarian")).toBe(1.5);
    expect(distractionShare(state)).toBe(0.75);
    expect(unionOpening(state)).toEqual({ lives: 3, gold: 20 });
    restartDefense(runner.ctx);
    expect(keep.of(runner.ctx).num("keep.lives")).toBe(before.lives + 3);
    expect(keep.of(runner.ctx).num("keep.gold")).toBe(before.gold + 20);
  });

  test("the union rides on the career's save and drops what this build does not know", () => {
    const stored = JSON.parse(JSON.stringify({ ...freshCampaign(), union: { dues: 12.4, hired: ["worker_monk", "worker_monk", "bogus"], training: { worker_barista: 9 }, town: { landlines: 1, moat: 2 } } }));
    const union = readCampaign(stored)!.union;
    expect(union).toEqual({ dues: 12, hired: ["worker_monk"], training: { worker_barista: 3 }, town: { landlines: 1 } });
    expect(readCampaign({})!.union.hired).toEqual([]);
  });
});
