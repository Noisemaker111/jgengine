import { describe, expect, test } from "bun:test";

import { createRunLoop } from "@jgengine/core/run/runLoop";

import { COMPACTOR_PLAN, COMPACTOR_SURGES } from "../compactor/schedule";
import { RIVAL_DEFS } from "../race/opponents";
import { RUN_SEED } from "./constants";
import { readRunState, RUN_STATE_KEY, saveRunState } from "./shiftState";
import { compactorPlanForShift, rivalsForShift, shiftInfo, SHIFT_LABELS, SHIFT_TABLE, type ShiftEffect } from "./shifts";

function loop() {
  return createRunLoop<ShiftEffect>({ seed: RUN_SEED, changes: SHIFT_TABLE });
}

function shiftSequence(runs: number): (string | null)[] {
  const run = loop();
  const played: (string | null)[] = [];
  for (let index = 0; index < runs; index += 1) {
    played.push(run.start().changeId);
    run.carry(100);
    run.settle("banked");
  }
  return played;
}

function storage(seed: Record<string, string> = {}) {
  return {
    getItem: (key: string) => seed[key] ?? null,
    setItem: (key: string, value: string) => { seed[key] = value; },
    seed,
  };
}

describe("drift foundry shifts", () => {
  test("the first run is honest and every run after it changes something", () => {
    const played = shiftSequence(5);
    expect(played[0]).toBeNull();
    expect(played.slice(1).every((id) => id !== null)).toBe(true);
    expect(new Set(played.slice(1)).size).toBeGreaterThan(1);
  });

  test("the same seed replays the same shifts", () => {
    expect(shiftSequence(6)).toEqual(shiftSequence(6));
  });

  test("the night crew is a late shift, so it cannot be the second run", () => {
    const played = shiftSequence(12);
    expect(played[1]).not.toBe("night-shift");
    expect(played).toContain("night-shift");
  });

  test("HOBBS's shift tightens his line and hardens his pace", () => {
    const before = RIVAL_DEFS.find((def) => def.id === "rival_hobbs")!;
    const after = rivalsForShift("hobbs-line").find((def) => def.id === "rival_hobbs")!;
    expect(after.pace).toBeGreaterThan(before.pace);
    expect(Math.max(...after.line.map(Math.abs))).toBeLessThan(Math.max(...before.line.map(Math.abs)));
    // The other two drive exactly as authored.
    expect(rivalsForShift("hobbs-line").filter((def) => def.id !== "rival_hobbs")).toEqual(RIVAL_DEFS.filter((def) => def.id !== "rival_hobbs"));
  });

  test("TALLY's shift takes away the field's tow", () => {
    const before = RIVAL_DEFS.find((def) => def.id === "rival_tally")!;
    const after = rivalsForShift("tally-honest").find((def) => def.id === "rival_tally")!;
    expect(after.band).toBeLessThan(before.band);
    expect(after.line).toEqual(before.line);
  });

  test("the crusher's shift starts it closer to the grid", () => {
    expect(compactorPlanForShift("crusher-lead").startZ).toBe(COMPACTOR_PLAN.startZ - 12);
    expect(compactorPlanForShift("crusher-lead").surges).toEqual(COMPACTOR_SURGES);
  });

  test("the night shift brings every surge earlier and faster", () => {
    const plan = compactorPlanForShift("night-shift");
    plan.surges.forEach((surge, index) => {
      expect(surge.startT).toBe(COMPACTOR_SURGES[index]!.startT - 6);
      expect(surge.endT).toBe(COMPACTOR_SURGES[index]!.endT - 6);
      expect(surge.speed).toBeCloseTo(COMPACTOR_SURGES[index]!.speed + 0.6, 5);
    });
  });

  test("no shift leaves the yard exactly as authored", () => {
    expect(rivalsForShift(null)).toBe(RIVAL_DEFS);
    expect(compactorPlanForShift(null)).toEqual(COMPACTOR_PLAN);
    expect(shiftInfo(null)).toBeNull();
  });

  test("every table entry is named for the results card", () => {
    for (const entry of SHIFT_TABLE) {
      expect(SHIFT_LABELS[entry.id as keyof typeof SHIFT_LABELS].label.length).toBeGreaterThan(0);
      expect(shiftInfo(entry.id)?.id).toBe(entry.id);
    }
  });

  test("run state survives a save and reload, and the next shift is the same one", () => {
    const store = storage();
    const run = loop();
    for (let index = 0; index < 3; index += 1) {
      run.start();
      run.carry(40);
      run.settle("banked");
    }
    expect(saveRunState(run.snapshot(), store)).toBe(true);

    const reopened = loop();
    const saved = readRunState(store);
    expect(saved).not.toBeNull();
    reopened.restore(saved!);
    expect(reopened.snapshot()).toEqual(run.snapshot());
    expect(reopened.start().changeId).toBe(run.start().changeId);
  });

  test("a saved run keeps its salvage at risk", () => {
    const store = storage();
    const run = loop();
    run.start();
    run.carry(75);
    saveRunState(run.snapshot(), store);
    const reopened = loop();
    reopened.restore(readRunState(store)!);
    expect(reopened.haul()).toBe(75);
  });

  test("a junk or impossible save is ignored instead of trusted", () => {
    const junk = storage({ [RUN_STATE_KEY]: "{\"run\":-2}" });
    expect(readRunState(junk)).toBeNull();
    const behind = storage({ [RUN_STATE_KEY]: JSON.stringify({ run: 1, completed: 4, haul: 0, changeId: null, bankedTotal: 0, lostTotal: 0, bestHaul: 0 }) });
    expect(readRunState(behind)).toBeNull();
    expect(readRunState(undefined)).toBeNull();
    expect(readRunState(storage({ [RUN_STATE_KEY]: "not json" }))).toBeNull();
  });
});
