import { describe, expect, test } from "bun:test";
import {
  addScheduledRule,
  advanceLedger,
  annotate,
  balanceOf,
  cancelRule,
  capAmount,
  createResourceLedger,
  curveScale,
  pauseRule,
  redirect,
  rejectWhen,
  resumeRule,
  taxFraction,
  thresholdScale,
  type ResourceLedger,
  type ResourcePolicy,
} from "@jgengine/core/economy/resourceLedger";

function eventKinds(events: { kind: string; ruleId: string }[], ruleId: string): string[] {
  return events.filter((e) => e.ruleId === ruleId).map((e) => e.kind);
}

describe("resourceLedger scheduling", () => {
  test("fires once per cadence and credits the recipient", () => {
    let ledger = createResourceLedger();
    ledger = addScheduledRule(ledger, {
      id: "mine",
      currency: "ore",
      amount: 5,
      everySeconds: 10,
      startSeconds: 10,
      recipient: "player",
    });

    const res = advanceLedger(ledger, 35);
    expect(res.applied.length).toBe(3); // t=10,20,30
    expect(balanceOf(res.ledger, "player", "ore")).toBe(15);
    expect(res.ledger.nowSeconds).toBe(35);
    expect(eventKinds(res.events, "mine")[0]).toBe("started");
  });

  test("does not fire before the start time", () => {
    let ledger = createResourceLedger();
    ledger = addScheduledRule(ledger, {
      id: "r",
      currency: "g",
      amount: 1,
      everySeconds: 10,
      startSeconds: 100,
      recipient: "p",
    });
    const res = advanceLedger(ledger, 50);
    expect(res.applied.length).toBe(0);
    expect(res.events.length).toBe(0);
  });

  test("rewinding the clock throws", () => {
    const ledger = createResourceLedger({ nowSeconds: 100 });
    expect(() => advanceLedger(ledger, 50)).toThrow();
  });

  test("moves resources from source to recipient (transfer)", () => {
    let ledger = createResourceLedger({ accounts: { citizen: { gold: 100 } } });
    ledger = addScheduledRule(ledger, {
      id: "rent",
      currency: "gold",
      amount: 10,
      everySeconds: 5,
      startSeconds: 5,
      source: "citizen",
      recipient: "landlord",
    });
    const res = advanceLedger(ledger, 15); // 3 cycles
    expect(balanceOf(res.ledger, "citizen", "gold")).toBe(70);
    expect(balanceOf(res.ledger, "landlord", "gold")).toBe(30);
  });

  test("upkeep with no recipient burns from the source (can go negative)", () => {
    let ledger = createResourceLedger({ accounts: { player: { gold: 12 } } });
    ledger = addScheduledRule(ledger, {
      id: "upkeep",
      currency: "gold",
      amount: 5,
      everySeconds: 1,
      startSeconds: 1,
      source: "player",
    });
    const res = advanceLedger(ledger, 3); // 3 cycles => -15
    expect(balanceOf(res.ledger, "player", "gold")).toBe(-3);
  });
});

describe("resourceLedger catch-up policies", () => {
  function build(catchUp: "each" | "sum" | "skip", extra: Record<string, unknown> = {}): ResourceLedger {
    let ledger = createResourceLedger();
    ledger = addScheduledRule(ledger, {
      id: "income",
      currency: "gold",
      amount: 4,
      everySeconds: 10,
      startSeconds: 10,
      recipient: "p",
      catchUp,
      ...extra,
    });
    return ledger;
  }

  test("each replays every missed cycle individually", () => {
    const res = advanceLedger(build("each"), 100); // t=10..100 => 10 cycles
    expect(res.applied.length).toBe(10);
    expect(balanceOf(res.ledger, "p", "gold")).toBe(40);
  });

  test("sum collapses missed cycles into one transaction", () => {
    const res = advanceLedger(build("sum"), 100);
    expect(res.applied.length).toBe(1);
    expect(res.applied[0]!.amount).toBe(40);
    expect(balanceOf(res.ledger, "p", "gold")).toBe(40);
  });

  test("skip applies only the most recent cycle and reports the rest skipped", () => {
    const res = advanceLedger(build("skip"), 100);
    expect(res.applied.length).toBe(1);
    expect(balanceOf(res.ledger, "p", "gold")).toBe(4);
    const skipped = res.events.find((e) => e.kind === "skipped");
    expect(skipped?.detail).toBe(9);
  });

  test("maxCatchUpCycles drops overflow cycles but time still advances", () => {
    const res = advanceLedger(build("each", { maxCatchUpCycles: 3 }), 100);
    expect(res.applied.length).toBe(3);
    expect(res.events.find((e) => e.kind === "skipped")?.detail).toBe(7);
    // cursor moved past the whole window despite dropping cycles
    const next = advanceLedger(res.ledger, 110);
    expect(next.applied.length).toBe(1);
  });

  test("maxCyclesPerRule bounds work regardless of policy", () => {
    const res = advanceLedger(build("each"), 100_000, { maxCyclesPerRule: 5 });
    expect(res.applied.length).toBe(5);
  });

  test("large delta stays deterministic across advance granularity", () => {
    // One big jump equals many small jumps for a summing rule.
    const oneJump = advanceLedger(build("sum"), 1000);
    let acc = build("sum");
    for (let t = 100; t <= 1000; t += 100) {
      const r = advanceLedger(acc, t);
      acc = r.ledger;
    }
    expect(balanceOf(acc, "p", "gold")).toBe(balanceOf(oneJump.ledger, "p", "gold"));
  });
});

describe("resourceLedger reserve / depletion", () => {
  test("finite reserve depletes and marks the rule done", () => {
    let ledger = createResourceLedger();
    ledger = addScheduledRule(ledger, {
      id: "vein",
      currency: "ore",
      amount: 3,
      everySeconds: 1,
      startSeconds: 1,
      recipient: "cart",
      reserve: 10,
    });
    const res = advanceLedger(ledger, 100);
    // 10 / 3 => 3 full (9) + 1 partial (1) = 10 extracted total
    expect(balanceOf(res.ledger, "cart", "ore")).toBe(10);
    expect(res.ledger.cursors.vein!.done).toBe(true);
    expect(res.events.some((e) => e.kind === "depleted")).toBe(true);
    // No further extraction after depletion.
    const again = advanceLedger(res.ledger, 200);
    expect(again.applied.length).toBe(0);
  });
});

describe("resourceLedger lifecycle", () => {
  test("endSeconds stops the rule and emits ended", () => {
    let ledger = createResourceLedger();
    ledger = addScheduledRule(ledger, {
      id: "sub",
      currency: "gold",
      amount: 2,
      everySeconds: 10,
      startSeconds: 10,
      endSeconds: 25,
      source: "player",
    });
    const res = advanceLedger(ledger, 100); // fires t=10,20 only
    expect(res.applied.length).toBe(2);
    expect(res.events.some((e) => e.kind === "ended")).toBe(true);
    expect(res.ledger.cursors.sub!.done).toBe(true);
  });

  test("pause holds cycles; resume settles them per catch-up", () => {
    let ledger = createResourceLedger();
    ledger = addScheduledRule(ledger, {
      id: "r",
      currency: "gold",
      amount: 1,
      everySeconds: 10,
      startSeconds: 10,
      recipient: "p",
    });
    let res = advanceLedger(ledger, 15); // 1 cycle
    expect(balanceOf(res.ledger, "p", "gold")).toBe(1);
    let paused = pauseRule(res.ledger, "r");
    const whilePaused = advanceLedger(paused, 55);
    expect(whilePaused.applied.length).toBe(0); // nothing while paused
    const resumed = resumeRule(whilePaused.ledger, "r");
    const after = advanceLedger(resumed, 60);
    expect(after.applied.length).toBeGreaterThan(0); // missed cycles settle on resume
  });

  test("cancel removes the rule entirely", () => {
    let ledger = createResourceLedger();
    ledger = addScheduledRule(ledger, {
      id: "r",
      currency: "g",
      amount: 1,
      everySeconds: 5,
      startSeconds: 5,
      recipient: "p",
    });
    ledger = cancelRule(ledger, "r");
    expect(ledger.rules.r).toBeUndefined();
    const res = advanceLedger(ledger, 100);
    expect(res.applied.length).toBe(0);
  });
});

describe("resourceLedger policy pipeline", () => {
  function incomeLedger(): ResourceLedger {
    let ledger = createResourceLedger({ accounts: { treasury: { gold: 0 } } });
    ledger = addScheduledRule(ledger, {
      id: "wages",
      currency: "gold",
      amount: 100,
      everySeconds: 10,
      startSeconds: 10,
      recipient: "worker",
    });
    return ledger;
  }

  test("cap limits the amount and annotates provenance", () => {
    const res = advanceLedger(incomeLedger(), 10, { policies: [capAmount(60)] });
    expect(res.applied[0]!.amount).toBe(60);
    expect(res.applied[0]!.provenance).toContain("capped");
  });

  test("tax splits a fraction to another recipient", () => {
    const res = advanceLedger(incomeLedger(), 10, { policies: [taxFraction(0.25, "state")] });
    expect(balanceOf(res.ledger, "worker", "gold")).toBe(75);
    expect(balanceOf(res.ledger, "state", "gold")).toBe(25);
  });

  test("reject drops a transaction", () => {
    const res = advanceLedger(incomeLedger(), 10, {
      policies: [rejectWhen((txn) => txn.amount > 50)],
    });
    expect(res.applied.length).toBe(0);
  });

  test("redirect overrides endpoints", () => {
    const res = advanceLedger(incomeLedger(), 10, { policies: [redirect({ recipient: "bank" })] });
    expect(balanceOf(res.ledger, "bank", "gold")).toBe(100);
    expect(balanceOf(res.ledger, "worker", "gold")).toBe(0);
  });

  test("annotate records provenance without changing value", () => {
    const res = advanceLedger(incomeLedger(), 10, { policies: [annotate("payroll")] });
    expect(res.applied[0]!.amount).toBe(100);
    expect(res.applied[0]!.provenance).toContain("payroll");
  });

  test("policies compose left to right", () => {
    // Tax first (100 -> 90 kept + 10 to state), then cap the kept portion to 50.
    const res = advanceLedger(incomeLedger(), 10, {
      policies: [taxFraction(0.1, "state"), capAmount(50)],
    });
    expect(balanceOf(res.ledger, "worker", "gold")).toBe(50);
    expect(balanceOf(res.ledger, "state", "gold")).toBe(10);
  });

  test("threshold bands scale by caller context (progressive bracket)", () => {
    const bracket = thresholdScale("income", [
      { min: 0, factor: 1 },
      { min: 100, factor: 0.9 },
      { min: 1000, factor: 0.5 },
    ]);
    const low = advanceLedger(incomeLedger(), 10, { policies: [bracket], vars: { income: 50 } });
    const high = advanceLedger(incomeLedger(), 10, { policies: [bracket], vars: { income: 2000 } });
    expect(low.applied[0]!.amount).toBe(100);
    expect(high.applied[0]!.amount).toBe(50);
  });

  test("curve scales by context value", () => {
    const scale = curveScale("pop", { kind: "linear", base: 0, per: 2 });
    const res = advanceLedger(incomeLedger(), 10, { policies: [scale], vars: { pop: 3 } });
    expect(res.applied[0]!.amount).toBe(600); // 100 * (2*3)
  });

  test("precision quantises the applied amount", () => {
    let ledger = createResourceLedger();
    ledger = addScheduledRule(ledger, {
      id: "interest",
      currency: "gold",
      amount: 10,
      everySeconds: 10,
      startSeconds: 10,
      recipient: "p",
    });
    const res = advanceLedger(ledger, 10, {
      policies: [(txn) => [{ ...txn, amount: txn.amount * 0.333 }]],
      precision: { quantum: 0.01, mode: "floor" },
    });
    expect(res.applied[0]!.amount).toBeCloseTo(3.33, 6);
  });
});

describe("resourceLedger serialization", () => {
  test("round-trips through JSON and resumes deterministically", () => {
    let ledger = createResourceLedger({ accounts: { p: { gold: 0 } } });
    ledger = addScheduledRule(ledger, {
      id: "vein",
      currency: "ore",
      amount: 3,
      everySeconds: 10,
      startSeconds: 10,
      recipient: "p",
      reserve: 12,
    });
    ledger = addScheduledRule(ledger, {
      id: "wage",
      currency: "gold",
      amount: 5,
      everySeconds: 10,
      startSeconds: 10,
      recipient: "p",
      catchUp: "sum",
    });

    const mid = advanceLedger(ledger, 25).ledger; // partial progress

    // Serialize -> restore, then continue.
    const restored: ResourceLedger = JSON.parse(JSON.stringify(mid));
    const fromRestored = advanceLedger(restored, 60);
    const fromLive = advanceLedger(mid, 60);

    expect(fromRestored.ledger).toEqual(fromLive.ledger);
    expect(fromRestored.applied).toEqual(fromLive.applied);
  });

  test("deterministic across rule id ordering (sorted processing)", () => {
    const policy: ResourcePolicy = (txn) => [txn];
    function make(ids: string[]): ResourceLedger {
      let ledger = createResourceLedger({ accounts: { pool: { gold: 0 } } });
      for (const id of ids) {
        ledger = addScheduledRule(ledger, {
          id,
          currency: "gold",
          amount: 1,
          everySeconds: 10,
          startSeconds: 10,
          recipient: "pool",
        });
      }
      return ledger;
    }
    const a = advanceLedger(make(["a", "b", "c"]), 30, { policies: [policy] });
    const b = advanceLedger(make(["c", "a", "b"]), 30, { policies: [policy] });
    expect(a.applied.map((t) => t.ruleId)).toEqual(b.applied.map((t) => t.ruleId));
  });
});

// ---------------------------------------------------------------------------
// Composed worked examples from the issue: finite harvest node, population-based
// upkeep, and a non-RTS recurring cost/income adopter — all on the one seam.
// ---------------------------------------------------------------------------
describe("resourceLedger composed examples", () => {
  test("finite harvest node: RTS mine that empties and stops", () => {
    let ledger = createResourceLedger({ accounts: { stockpile: { gold: 0 } } });
    ledger = addScheduledRule(ledger, {
      id: "gold-mine",
      currency: "gold",
      amount: 8,
      everySeconds: 5,
      startSeconds: 5,
      recipient: "stockpile",
      reserve: 100, // finite deposit
    });
    const res = advanceLedger(ledger, 1000);
    expect(balanceOf(res.ledger, "stockpile", "gold")).toBe(100); // never exceeds the deposit
    expect(res.ledger.cursors["gold-mine"]!.done).toBe(true);
  });

  test("population-based upkeep: cost curves with population context", () => {
    let ledger = createResourceLedger({ accounts: { crown: { gold: 1000 } } });
    ledger = addScheduledRule(ledger, {
      id: "army-upkeep",
      currency: "gold",
      amount: 1, // nominal; curve turns population into the real cost
      everySeconds: 10,
      startSeconds: 10,
      source: "crown",
    });
    // Upkeep = 2 gold per soldier per cycle.
    const upkeepCurve = curveScale("soldiers", { kind: "linear", base: 0, per: 2 });
    const res = advanceLedger(ledger, 10, { policies: [upkeepCurve], vars: { soldiers: 20 } });
    expect(balanceOf(res.ledger, "crown", "gold")).toBe(1000 - 40);
  });

  test("non-RTS recurring cost/income: monthly subscription that expires", () => {
    let ledger = createResourceLedger({ accounts: { user: { credits: 30 } } });
    ledger = addScheduledRule(ledger, {
      id: "streaming",
      currency: "credits",
      amount: 10,
      everySeconds: 30, // "month"
      startSeconds: 30,
      endSeconds: 95, // three billing cycles then cancel
      source: "user",
      recipient: "provider",
    });
    const res = advanceLedger(ledger, 300);
    expect(balanceOf(res.ledger, "user", "credits")).toBe(0); // 3 * 10 charged
    expect(balanceOf(res.ledger, "provider", "credits")).toBe(30);
    expect(res.ledger.cursors.streaming!.done).toBe(true);
  });
});
