import { describe, expect, it } from "bun:test";
import { resolveReceivedDamage, type ReceivedModifier } from "./receivedDamage";

const ctx = {
  channel: "fire",
  source: "boss",
  target: "hero",
  targetStatuses: ["amplify"],
  tags: ["crit"],
};

describe("resolveReceivedDamage", () => {
  it("amplifies via a scale factor > 1 while a status is active", () => {
    const mods: ReceivedModifier[] = [
      { id: "amp", when: { whileStatus: ["amplify"] }, policy: { kind: "scale", factor: 2 } },
    ];
    const r = resolveReceivedDamage({ amount: 50, context: ctx, modifiers: mods });
    expect(r.amount).toBe(100);
    expect(r.steps[0]).toMatchObject({ modifierId: "amp", kind: "scale", before: 50, after: 100 });
  });

  it("skips a modifier whose predicate does not match the channel", () => {
    const mods: ReceivedModifier[] = [
      { when: { channels: ["ice"] }, policy: { kind: "scale", factor: 0.5 } },
    ];
    const r = resolveReceivedDamage({ amount: 50, context: ctx, modifiers: mods });
    expect(r.amount).toBe(50);
    expect(r.steps).toHaveLength(0);
  });

  it("runs modifiers in ascending order and records each step", () => {
    const mods: ReceivedModifier[] = [
      { id: "cap", order: 2, policy: { kind: "cap", max: 60 } },
      { id: "amp", order: 1, policy: { kind: "scale", factor: 2 } },
    ];
    const r = resolveReceivedDamage({ amount: 50, context: ctx, modifiers: mods });
    // amp first: 100, then cap to 60
    expect(r.amount).toBe(60);
    expect(r.steps.map((s) => s.modifierId)).toEqual(["amp", "cap"]);
  });

  it("reduces (scale < 1), floors, and applies flat deltas", () => {
    const mods: ReceivedModifier[] = [
      { order: 1, policy: { kind: "scale", factor: 0.1 } },
      { order: 2, policy: { kind: "floor", min: 10 } },
      { order: 3, policy: { kind: "flat", delta: 5 } },
    ];
    const r = resolveReceivedDamage({ amount: 50, context: ctx, modifiers: mods });
    expect(r.amount).toBe(15); // 5 -> floor 10 -> +5
  });

  it("converts a portion to another channel on the same target", () => {
    const mods: ReceivedModifier[] = [
      { policy: { kind: "convert", toChannel: "physical", portion: 0.4 } },
    ];
    const r = resolveReceivedDamage({ amount: 100, context: ctx, modifiers: mods });
    expect(r.amount).toBe(60);
    expect(r.conversions).toEqual([{ channel: "physical", amount: 40 }]);
  });

  it("redirects a portion to another target", () => {
    const mods: ReceivedModifier[] = [
      { policy: { kind: "redirect", toTarget: "decoy", portion: 0.5 } },
    ];
    const r = resolveReceivedDamage({ amount: 80, context: ctx, modifiers: mods });
    expect(r.amount).toBe(40);
    expect(r.redirects).toEqual([{ target: "decoy", amount: 40 }]);
  });

  it("immune zeroes the hit and short-circuits later modifiers", () => {
    const mods: ReceivedModifier[] = [
      { id: "immune", order: 1, policy: { kind: "immune" } },
      { id: "amp", order: 2, policy: { kind: "scale", factor: 2 } },
    ];
    const r = resolveReceivedDamage({ amount: 50, context: ctx, modifiers: mods });
    expect(r.amount).toBe(0);
    expect(r.immune).toBe(true);
    expect(r.steps).toHaveLength(1);
  });

  it("never produces a negative amount", () => {
    const mods: ReceivedModifier[] = [{ policy: { kind: "flat", delta: -999 } }];
    const r = resolveReceivedDamage({ amount: 50, context: ctx, modifiers: mods });
    expect(r.amount).toBe(0);
  });

  it("survives a JSON serialize round-trip of the modifier list", () => {
    const mods: ReceivedModifier[] = [
      { id: "amp", when: { whileStatus: ["amplify"], channels: ["fire"] }, policy: { kind: "scale", factor: 2 } },
    ];
    const clone: ReceivedModifier[] = JSON.parse(JSON.stringify(mods));
    const a = resolveReceivedDamage({ amount: 50, context: ctx, modifiers: mods });
    const b = resolveReceivedDamage({ amount: 50, context: ctx, modifiers: clone });
    expect(b).toEqual(a);
  });
});
