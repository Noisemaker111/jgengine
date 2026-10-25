import { describe, expect, test } from "bun:test";
import { generateBodyPlan } from "../creatures/bodyPlan";
import { emptyNeeds } from "../needs/needs";
import type { MemberState } from "../session/types";
import { SHIFT_SECONDS, yieldShiftLabel } from "./schedule";

function member(patch: Partial<MemberState> = {}): MemberState {
  return {
    id: "alien:0", name: "Ora", bodyPlan: generateBodyPlan("schedule-test"), job: "tester", needs: emptyNeeds(),
    action: { kind: "idle" }, assignedByPlayer: false, actionUntil: 0, lifestyle: "yield", stress: 0, recovering: false,
    workToday: 0, harvestToday: 0, shiftProgress: 0, shiftDay: -1, completedShifts: 0, missedShifts: 0, concern: null,
    ...patch,
  };
}

describe("yieldShiftLabel", () => {
  test("is null when no paid shift is under way", () => {
    expect(yieldShiftLabel(member())).toBeNull();
  });

  test("shows the walk to the console once a shift is directed", () => {
    expect(yieldShiftLabel(member({ action: { kind: "seek", goal: "work", objId: "starter:work_console" } }))).toBe("Heading to Yield Console");
  });

  test("counts down the remaining shift seconds at the console", () => {
    const working = { kind: "use" as const, goal: "work" as const, objId: "starter:work_console" };
    expect(yieldShiftLabel(member({ action: working, workToday: 0 }))).toBe(`On shift · ${SHIFT_SECONDS}s left`);
    expect(yieldShiftLabel(member({ action: working, workToday: 7.2 }))).toBe("On shift · 13s left");
    expect(yieldShiftLabel(member({ action: working, workToday: SHIFT_SECONDS }))).toBe("On shift · 0s left");
  });

  test("ignores bloom beings and non-work actions", () => {
    expect(yieldShiftLabel(member({ lifestyle: "bloom", action: { kind: "use", goal: "work", objId: "x" } }))).toBeNull();
    expect(yieldShiftLabel(member({ action: { kind: "use", goal: "energy", objId: "x" } }))).toBeNull();
  });
});
