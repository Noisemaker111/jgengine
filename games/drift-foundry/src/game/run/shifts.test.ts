import { describe, expect, test } from "bun:test";


import { COMPACTOR_PLAN, COMPACTOR_SURGES } from "../compactor/schedule";
import { RIVAL_DEFS } from "../race/opponents";
import { memorySaveBackend, type SaveBackend } from "@jgengine/core/save/saveStore";
import { createFoundrySave } from "../foundrySave";
import { createShiftLoop, readRunState, RUN_STATE_KEY } from "./shiftState";
import { compactorPlanForShift, rivalsForShift, shiftInfo, SHIFT_LABELS, SHIFT_TABLE } from "./shifts";

function loop() {
  return createShiftLoop();
}

function shiftSequence(runs: number): (string | null)[] {
  const run = loop();
  const played: (string | null)[] = [];
  for (let index = 0; index < runs; index += 1) {
    played.push(run.start().optionId);
    run.carry(100);
    run.settle({ outcome: "banked" });
  }
  return played;
}

/** The yard's save as a reload reads it: a fresh document over the same backend. */
async function reload(backend: SaveBackend) {
  const save = createFoundrySave(backend);
  await save.load();
  return save;
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

  test("run state survives a save and reload, and the next shift is the same one", async () => {
    const backend = memorySaveBackend();
    const store = await reload(backend);
    const run = loop();
    for (let index = 0; index < 3; index += 1) {
      run.start();
      run.carry(40);
      run.settle({ outcome: "banked" });
    }
    store.profile.run = run.snapshot();
    expect(await store.write()).toBe(true);

    const reopened = loop();
    const saved = (await reload(backend)).profile.run;
    expect(saved).not.toBeNull();
    reopened.restore(saved!);
    expect(reopened.snapshot()).toEqual(run.snapshot());
    expect(reopened.start().optionId).toBe(run.start().optionId);
  });

  test("a saved run keeps its salvage at risk", async () => {
    const backend = memorySaveBackend();
    const store = await reload(backend);
    const run = loop();
    run.start();
    run.carry(75);
    store.profile.run = run.snapshot();
    await store.write();
    const reopened = loop();
    reopened.restore((await reload(backend)).profile.run!);
    expect(reopened.carried()).toBe(75);
  });

  test("a junk or impossible save is ignored instead of trusted", async () => {
    expect(readRunState({ run: -2 })).toBeNull();
    expect(readRunState({ run: 1, completed: 4, haul: 0, changeId: null, bankedTotal: 0, lostTotal: 0, bestHaul: 0 })).toBeNull();
    expect(readRunState(undefined)).toBeNull();
    // A run an older build kept at its own key, in its older field names, lifts into the run section.
    const backend = memorySaveBackend();
    await backend.write(RUN_STATE_KEY, JSON.stringify({ run: 3, completed: 2, haul: 5, changeId: "hobbs-line", bankedTotal: 0, lostTotal: 0, bestHaul: 0 }));
    expect((await reload(backend)).profile.run).toEqual({ session: 3, closed: 2, carried: 5, optionId: "hobbs-line" });
    const junk = memorySaveBackend();
    await junk.write(RUN_STATE_KEY, "not json");
    expect((await reload(junk)).profile.run).toBeNull();
  });
});
