import { describe, expect, test } from "bun:test";

import { createCoachMarkSequence, type CoachMarkStep } from "./coachMarks";

const STEPS: readonly CoachMarkStep[] = [
  { id: "move", title: "Move", body: "WASD to move." },
  { id: "attack", title: "Attack", body: "Click to swing.", condition: "found-enemy" },
  { id: "loot", title: "Loot", body: "Walk over drops." },
];

function seq(now = () => 0) {
  return createCoachMarkSequence({ steps: STEPS, now });
}

describe("createCoachMarkSequence", () => {
  test("current() returns the first un-seen, condition-satisfied step; advance walks in order", () => {
    const s = seq();
    expect(s.current()?.step.id).toBe("move");
    expect(s.current()?.total).toBe(3);
    // advance past "move" — "attack" is gated on "found-enemy", so it is skipped for now.
    expect(s.advance()?.step.id).toBe("loot");
    expect(s.isSeen("move")).toBe(true);
  });

  test("a gated step stays hidden until its trigger is satisfied", () => {
    const s = seq();
    s.dismiss("move");
    s.dismiss("loot");
    expect(s.current()).toBeNull(); // only the gated "attack" remains
    expect(s.isComplete()).toBe(false);
    s.satisfy("found-enemy");
    expect(s.current()?.step.id).toBe("attack");
  });

  test("seen persists so a dismissed step never re-shows; skipAll completes the tour", () => {
    const s = seq();
    s.dismiss("move");
    expect(s.current()?.step.id).toBe("loot"); // not "move" again
    s.skipAll();
    expect(s.isComplete()).toBe(true);
    expect(s.current()).toBeNull();
    expect(s.remaining()).toBe(0);
  });

  test("remaining counts un-seen steps regardless of gating", () => {
    const s = seq();
    expect(s.remaining()).toBe(3);
    s.dismiss("move");
    expect(s.remaining()).toBe(2);
  });

  test("snapshot/restore round-trips the seen set and satisfied triggers", () => {
    const s = seq(() => 1234);
    s.dismiss("move");
    s.satisfy("found-enemy");
    const snap = JSON.parse(JSON.stringify(s.snapshot()));

    const revived = seq();
    revived.restore(snap);
    expect(revived.isSeen("move")).toBe(true);
    expect(revived.seenAt("move")).toBe(1234);
    expect(revived.isTriggerSatisfied("found-enemy")).toBe(true);
    expect(revived.current()?.step.id).toBe("attack");
  });

  test("subscribe fires on advance and stops after unsubscribe", () => {
    const s = seq();
    let hits = 0;
    const off = s.subscribe(() => { hits += 1; });
    s.advance();
    off();
    s.advance();
    expect(hits).toBe(1);
  });
});
