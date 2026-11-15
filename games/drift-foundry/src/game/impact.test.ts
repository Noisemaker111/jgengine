import { expect, test } from "bun:test";
import { impactBursts } from "./impact";

const frame = (runTime = 1) => ({
  phase: "running" as const, paused: false, runTime,
  pose: { position: [0, 0, 111] as const, heading: 0, speedKmh: 40, airborne: false, blockedByGate: false },
  clearedGateIds: new Set<string>(), armorSavesUsed: 0,
});

test("real plow, landing and armor transitions emit once; holding or resetting cannot replay them", () => {
  const before = frame();
  const after = { ...frame(1.05), clearedGateIds: new Set(["nine_plow_cereal"]) };
  expect(impactBursts(before, after).map(burst => burst.kind)).toEqual(["plow"]);
  expect(impactBursts(after, { ...after, runTime: 1.1 })).toEqual([]);
  expect(impactBursts(after, frame(0))).toEqual([]);
  expect(impactBursts({ ...before, pose: { ...before.pose, airborne: true } }, frame(1.05))[0]?.kind).toBe("landing");
  expect(impactBursts(before, { ...frame(1.05), armorSavesUsed: 1 })[0]?.kind).toBe("armor");
});

test("pause and rejected gate approach emit no false success; first contact only emits sparks", () => {
  const before = frame();
  const blocked = { ...frame(1.05), pose: { ...before.pose, blockedByGate: true } };
  expect(impactBursts(before, blocked).map(burst => burst.kind)).toEqual(["blocked"]);
  expect(impactBursts(blocked, { ...blocked, runTime: 1.1 })).toEqual([]);
  expect(impactBursts(before, { ...blocked, paused: true })).toEqual([]);
});

test("a shelf grab, a power-up and a banked trick each pop once, with their own cue", () => {
  const style = (at: number | null) => ({ points: 0, combo: 1, comboLeft: 0, last: at === null ? null : { label: "DRIFT", at } });
  const before = { ...frame(), shelvesTaken: new Set<string>(), powersUsed: 0, style: style(null) };
  const after = { ...frame(1.05), shelvesTaken: new Set(["shelf_a"]), powersUsed: 1, style: style(1.04) };
  expect(impactBursts(before, after).map((burst) => burst.kind)).toEqual(["grab", "power", "trick"]);
  expect(impactBursts(after, { ...after, runTime: 1.1 })).toEqual([]);
});
