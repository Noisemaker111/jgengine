import { describe, expect, test } from "bun:test";

import { campaign, freshCampaign, readCampaign, recordOvertime, OVERTIME_BOARD_SIZE } from "../campaign";
import { beaconRunner } from "../testing";
import { restartDefense } from "../world/setup";
import { DIRECTOR_SEED, TOTAL_WAVES } from "./manifest";
import { ENDLESS_WAVES, endlessEncounter, endlessWave, eraOf, ERAS } from "./endless";
import { bindRunMode, runMode, waveTotal } from "./mode";

const size = (wave: number) => endlessWave(DIRECTOR_SEED, wave).groups.reduce((sum, group) => sum + (group.count ?? 0), 0);

describe("Overtime", () => {
  test("the eras run dial-up, then smartphones, then AI", () => {
    expect(ERAS.map((era) => era.id)).toEqual(["dialup", "smartphone", "ai"]);
    expect(eraOf(1).id).toBe("dialup");
    expect(eraOf(9).id).toBe("smartphone");
    expect(eraOf(17).id).toBe("ai");
    expect(eraOf(60).id).toBe("ai");
    for (const wave of [2, 10, 20]) {
      const units = new Set(eraOf(wave).units.map((entry) => entry.unit));
      for (const group of endlessWave(DIRECTOR_SEED, wave).groups) expect(units.has(group.unit) || group.unit === eraOf(wave).boss).toBe(true);
    }
  });

  test("every eighth wave closes on the era's boss, and the night thickens", () => {
    expect(endlessWave(DIRECTOR_SEED, 8).groups.some((group) => group.unit === "tech_server")).toBe(true);
    expect(endlessWave(DIRECTOR_SEED, 24).groups.some((group) => group.unit === "boss_datacenter")).toBe(true);
    expect(endlessWave(DIRECTOR_SEED, 7).groups.some((group) => group.unit === eraOf(7).boss)).toBe(false);
    expect(size(40)).toBeGreaterThan(size(5));
    expect(endlessEncounter(DIRECTOR_SEED).waves).toHaveLength(ENDLESS_WAVES);
    expect(endlessWave(DIRECTOR_SEED, 12)).toEqual(endlessWave(DIRECTOR_SEED, 12));
  });

  test("a career that chose Overtime opens an endless run; a day stays twelve waves", () => {
    const runner = beaconRunner("overtime");
    restartDefense(runner.ctx);
    expect(runMode()).toBe("day");
    expect(waveTotal()).toBe(TOTAL_WAVES);
    runner.ui.invoke("campaign.mode", { mode: "overtime" });
    restartDefense(runner.ctx);
    expect(runMode()).toBe("overtime");
    expect(waveTotal()).toBe(ENDLESS_WAVES);
    runner.ui.invoke("campaign.mode", { mode: "day" });
    restartDefense(runner.ctx);
    expect(waveTotal()).toBe(TOTAL_WAVES);
    bindRunMode("day");
  });

  test("the board keeps the five deepest nights, deepest first, and survives the save", () => {
    const runner = beaconRunner("board");
    const places = [7, 22, 13, 9, 30, 4, 18].map((wave) => recordOvertime(runner.ctx, { wave, map: "main-street", era: eraOf(wave).label, manager: null }));
    expect(places[4]).toBe(1);
    expect(places[5]).toBe(0);
    const board = campaign.read(runner.ctx).overtime;
    expect(board.map((entry) => entry.wave)).toEqual([30, 22, 18, 13, 9]);
    expect(board).toHaveLength(OVERTIME_BOARD_SIZE);
    expect(readCampaign(JSON.parse(JSON.stringify(campaign.read(runner.ctx))))?.overtime).toEqual(board);
    expect(freshCampaign().mode).toBe("day");
  });
});
