import { describe, expect, it } from "bun:test";

import { createRebindSession, type RebindRow, type RebindSession, type RebindSessionSnapshot } from "./rebindSession";
import type { BindingOverrides } from "./bindingOverrides";

function rowOf(s: RebindSession, actionId: string): RebindRow {
  const row = s.row(actionId);
  if (row === null) throw new Error(`no row for ${actionId}`);
  return row;
}

const ACTIONS = [
  { id: "moveForward", label: "Move Forward", defaultCodes: ["KeyW"] },
  { id: "jump", label: "Jump", defaultCodes: ["Space"] },
  { id: "interact", label: "Interact", defaultCodes: ["KeyE"] },
  { id: "sprint", label: "Sprint", defaultCodes: { hold: ["ShiftLeft"] } },
] as const;

function session(overrides?: BindingOverrides) {
  return createRebindSession({ actions: ACTIONS.map((a) => ({ ...a })), overrides, now: () => 1000 });
}

describe("createRebindSession", () => {
  it("exposes one row per action in declaration order with default glyphs", () => {
    const rows = session().rows();
    expect(rows.map((r) => r.actionId)).toEqual(["moveForward", "jump", "interact", "sprint"]);
    expect(rows.map((r) => r.bindingLabel)).toEqual(["W", "Space", "E", "Shift"]);
    expect(rows.every((r) => r.isDefault)).toBe(true);
    expect(rows.every((r) => r.conflictWith.length === 0)).toBe(true);
  });

  it("merges seeded overrides over defaults and marks the row non-default", () => {
    const s = session({ jump: ["KeyJ"] });
    const jump = rowOf(s, "jump");
    expect(jump.bindingLabel).toBe("J");
    expect(jump.isDefault).toBe(false);
    expect(rowOf(s, "moveForward").isDefault).toBe(true);
  });

  it("ignores override keys for unknown actions", () => {
    const s = session({ phantom: ["KeyZ"] });
    expect(s.overrides()).toEqual({});
    expect(s.rows()).toHaveLength(4);
  });

  it("captures a normalized key into the armed action, preserving binding shape", () => {
    const s = session();
    expect(s.capture("KeyG")).toBe(false); // nothing armed
    s.beginCapture("sprint");
    expect(s.isCapturing("sprint")).toBe(true);
    expect(s.capturingActionId()).toBe("sprint");
    expect(s.capture("ControlRight")).toBe(true); // normalizes to "Control"
    const sprint = rowOf(s, "sprint");
    expect(sprint.code).toBe("Control");
    expect(sprint.bindingLabel).toBe("Ctrl");
    expect(sprint.isDefault).toBe(false);
    expect(sprint.changedAt).toBe(1000);
    // hold shape survived the rebind
    expect(s.overrides().sprint).toEqual({ hold: ["Control"] });
    expect(s.isCapturing()).toBe(false);
  });

  it("cancelCapture disarms without changing a binding", () => {
    const s = session();
    s.beginCapture("jump");
    s.cancelCapture();
    expect(s.isCapturing()).toBe(false);
    expect(rowOf(s, "jump").isDefault).toBe(true);
  });

  it("detects conflicts when two actions share a normalized code", () => {
    const s = session();
    s.beginCapture("interact");
    s.capture("KeyW"); // collides with moveForward
    expect(s.hasConflicts()).toBe(true);
    const conflicts = s.conflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.code).toBe("KeyW");
    expect(conflicts[0]?.actionIds.sort()).toEqual(["interact", "moveForward"]);
    const forward = rowOf(s, "moveForward");
    expect(forward.conflictWith).toEqual(["interact"]);
    expect(rowOf(s, "interact").conflictWith).toEqual(["moveForward"]);
    // sprint remains conflict-free
    expect(rowOf(s, "sprint").conflictWith).toEqual([]);
  });

  it("normalizes left/right modifier variants when detecting conflicts", () => {
    const s = session();
    s.beginCapture("jump");
    s.capture("ShiftRight"); // normalizes to Shift, same as sprint's ShiftLeft default
    expect(s.hasConflicts()).toBe(true);
    expect(s.conflicts()[0]?.actionIds.sort()).toEqual(["jump", "sprint"]);
  });

  it("reset returns one action to default; resetAll clears everything", () => {
    const s = session();
    s.beginCapture("moveForward");
    s.capture("KeyZ");
    s.beginCapture("jump");
    s.capture("KeyX");
    expect(Object.keys(s.overrides()).sort()).toEqual(["jump", "moveForward"]);
    s.reset("moveForward");
    expect(rowOf(s, "moveForward").bindingLabel).toBe("W");
    expect(s.overrides()).toEqual({ jump: ["KeyX"] });
    s.resetAll();
    expect(s.overrides()).toEqual({});
    expect(s.rows().every((r) => r.isDefault)).toBe(true);
  });

  it("apply hands current overrides to a persist callback", () => {
    const s = session();
    s.beginCapture("interact");
    s.capture("KeyF");
    let persisted: BindingOverrides | null = null;
    const returned = s.apply((o) => {
      persisted = o;
    });
    expect(persisted).toEqual({ interact: ["KeyF"] });
    expect(returned).toEqual({ interact: ["KeyF"] });
  });

  it("builds actions from an ActionCodesMap + labels", () => {
    const s = createRebindSession({
      input: { moveForward: ["KeyW"], map: ["KeyM"] },
      labels: { moveForward: "Move Forward" },
      now: () => 0,
    });
    const rows = s.rows();
    expect(rows.map((r) => r.label)).toEqual(["Move Forward", "map"]); // falls back to id
    expect(rows.map((r) => r.bindingLabel)).toEqual(["W", "M"]);
  });

  it("subscribe fires on capture, reset, and restore", () => {
    const s = session();
    let calls = 0;
    const unsub = s.subscribe(() => {
      calls += 1;
    });
    s.beginCapture("jump");
    s.capture("KeyB");
    expect(calls).toBeGreaterThanOrEqual(2); // arm + capture
    const before = calls;
    s.reset("jump");
    expect(calls).toBe(before + 1);
    unsub();
    s.beginCapture("interact");
    expect(calls).toBe(before + 1); // no more notifications
  });

  it("round-trips through snapshot/restore including in-flight capture", () => {
    const s = session();
    s.beginCapture("interact");
    s.capture("KeyH");
    s.beginCapture("jump");
    const snap: RebindSessionSnapshot = s.snapshot();
    expect(snap.overrides).toEqual({ interact: ["KeyH"] });
    expect(snap.capturingActionId).toBe("jump");

    const fresh = session();
    fresh.restore(snap);
    expect(fresh.overrides()).toEqual({ interact: ["KeyH"] });
    expect(rowOf(fresh, "interact").bindingLabel).toBe("H");
    expect(rowOf(fresh, "interact").changedAt).toBe(1000);
    expect(fresh.capturingActionId()).toBe("jump");
  });
});

describe("createRebindSession locked actions", () => {
  const lockedSession = (overrides?: BindingOverrides) =>
    createRebindSession({
      input: { jump: ["Space"], fire: { hold: ["mouse0"], repeatMs: 120, locked: true } },
      overrides,
      now: () => 1000,
    });

  it("marks only the locked row locked", () => {
    const s = lockedSession();
    expect(rowOf(s, "fire").locked).toBe(true);
    expect(rowOf(s, "jump").locked).toBe(false);
  });

  it("ignores a saved override for a locked action", () => {
    const s = lockedSession({ fire: ["KeyF"] });
    expect(s.overrides()).toEqual({});
    expect(rowOf(s, "fire").code).toBe("mouse0");
    expect(rowOf(s, "fire").isDefault).toBe(true);
  });

  it("never arms capture on a locked row, so capture and reset change nothing", () => {
    const s = lockedSession();
    s.beginCapture("fire");
    expect(s.capturingActionId()).toBeNull();
    expect(s.capture("KeyF")).toBe(false);
    s.reset("fire");
    expect(rowOf(s, "fire").code).toBe("mouse0");
    s.restore({ overrides: { fire: ["KeyF"] }, changedAt: {}, capturingActionId: "fire" });
    expect(s.capturingActionId()).toBeNull();
    expect(rowOf(s, "fire").code).toBe("mouse0");
  });

  it("reports a conflict when another action is captured onto a locked code", () => {
    const s = lockedSession();
    s.beginCapture("jump");
    s.capture("mouse0");
    expect(s.conflicts()).toEqual([{ code: "mouse0", actionIds: ["jump", "fire"] }]);
    expect(rowOf(s, "fire").conflictWith).toEqual(["jump"]);
  });
});
