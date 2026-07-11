import { describe, expect, test } from "bun:test";
import { FEVER_DURATION, GATE_FEVER_PAYOUT, GATE_PAYOUT, START_BANK } from "./config";
import { buildCatchers } from "./geometry";
import { PachinkoSim, payoutFor, reflect } from "./sim";
import type { Catcher } from "./types";

const catchers = buildCatchers();
const gate = catchers.find((c) => c.kind === "gate") as Catcher;
const pocket5 = catchers.find((c) => c.kind === "pocket" && c.payout === 5) as Catcher;
const pocket2 = catchers.find((c) => c.kind === "pocket" && c.payout === 2) as Catcher;
const gutter = catchers.find((c) => c.kind === "gutter") as Catcher;

function settle(sim: PachinkoSim, cap = 1500): void {
  for (let i = 0; i < cap && sim.liveBalls() > 0; i += 1) sim.step(1 / 120);
}

function ballTrace(sim: PachinkoSim): string {
  return JSON.stringify(sim.balls.map((b) => [b.x.toFixed(5), b.y.toFixed(5), b.vx.toFixed(5), b.vy.toFixed(5)]));
}

describe("collision reflection", () => {
  test("head-on bounce loses energy by restitution", () => {
    const r = reflect(0, 100, 0, -1, 0.5, 0);
    expect(r.vx).toBeCloseTo(0, 6);
    expect(r.vy).toBeCloseTo(-50, 6);
  });

  test("restitution 1 is a perfect mirror", () => {
    const r = reflect(0, 100, 0, -1, 1, 0);
    expect(r.vy).toBeCloseTo(-100, 6);
  });

  test("restitution 0 kills the normal component", () => {
    const r = reflect(0, 100, 0, -1, 0, 0);
    expect(r.vy).toBeCloseTo(0, 6);
  });

  test("reflects off a side normal", () => {
    const r = reflect(-100, 0, 1, 0, 0.5, 0);
    expect(r.vx).toBeCloseTo(50, 6);
    expect(r.vy).toBeCloseTo(0, 6);
  });

  test("jitter adds a tangential component only", () => {
    const r = reflect(0, 100, 0, -1, 0.5, 20);
    expect(r.vx).toBeCloseTo(20, 6);
    expect(r.vy).toBeCloseTo(-50, 6);
  });

  test("a ball fired straight into a peg reverses direction", () => {
    const sim = new PachinkoSim({ seed: "reflect", startBank: 10 });
    const peg = sim.pegs[40]!;
    sim.balls.push({ x: peg.x, y: peg.y - 8, vx: 0, vy: 120, r: 2.6, live: true, hitFlash: 0, age: 0 });
    const before = sim.balls[0]!.vy;
    for (let i = 0; i < 20; i += 1) sim.step(1 / 240);
    expect(before).toBeGreaterThan(0);
    expect(sim.balls[0]!.vy).toBeLessThan(before);
  });
});

describe("pocket payout", () => {
  test("gate pays its base and doubles-plus in fever", () => {
    expect(payoutFor(gate, false)).toBe(GATE_PAYOUT);
    expect(payoutFor(gate, true)).toBe(GATE_FEVER_PAYOUT);
  });

  test("pockets pay face value and double in fever", () => {
    expect(payoutFor(pocket5, false)).toBe(5);
    expect(payoutFor(pocket5, true)).toBe(10);
    expect(payoutFor(pocket2, false)).toBe(2);
    expect(payoutFor(pocket2, true)).toBe(4);
  });

  test("gutter always pays zero", () => {
    expect(payoutFor(gutter, false)).toBe(0);
    expect(payoutFor(gutter, true)).toBe(0);
  });

  test("a settled launch credits the bank by exactly its win minus cost", () => {
    const sim = new PachinkoSim({ seed: "payout", startBank: START_BANK });
    expect(sim.launch(0.6)).toBe(true);
    settle(sim);
    expect(sim.launched).toBe(1);
    expect(sim.wins).toHaveLength(1);
    const win = sim.wins[0]!;
    expect([0, 2, 3, 5, 10]).toContain(win.amount);
    expect(sim.bank).toBe(START_BANK - 1 + win.amount);
    expect(sim.bankHistory.at(-1)).toBe(sim.bank);
  });

  test("multiple balls stay in flight at once", () => {
    const sim = new PachinkoSim({ seed: "multi", startBank: 50 });
    for (let k = 0; k < 6; k += 1) {
      sim.launch(0.5);
      sim.step(1 / 60);
    }
    expect(sim.liveBalls()).toBeGreaterThan(1);
  });
});

describe("fever trigger", () => {
  test("three gate landings light fever, reset the counter, and start a 15s timer", () => {
    const sim = new PachinkoSim({ seed: "play", startBank: 100000 });
    let capturedTimer = -1;
    let capturedGateHits = -1;
    for (let ball = 0; ball < 150 && sim.feverCount === 0; ball += 1) {
      sim.launch(0.66);
      settle(sim);
      if (sim.feverCount === 1 && capturedTimer < 0) {
        capturedTimer = sim.feverTimer;
        capturedGateHits = sim.gateHits;
      }
    }
    expect(sim.feverCount).toBeGreaterThanOrEqual(1);
    expect(sim.feverActive).toBe(true);
    expect(capturedGateHits).toBe(0);
    expect(capturedTimer).toBeGreaterThan(0);
    expect(capturedTimer).toBeLessThanOrEqual(FEVER_DURATION);
  });

  test("fever expires after its duration", () => {
    const sim = new PachinkoSim({ seed: "expire", startBank: 50 });
    sim.feverActive = true;
    sim.feverTimer = FEVER_DURATION;
    for (let i = 0; i < Math.ceil((FEVER_DURATION + 1) * 60); i += 1) sim.step(1 / 60);
    expect(sim.feverActive).toBe(false);
    expect(sim.feverTimer).toBe(0);
  });
});

describe("determinism under fixed seed", () => {
  function playSession(seed: string): PachinkoSim {
    const sim = new PachinkoSim({ seed, startBank: 100000 });
    for (let k = 0; k < 1600; k += 1) {
      if (k % 15 === 0) sim.launch((k % 20) / 20);
      sim.step(1 / 120);
    }
    return sim;
  }

  test("same seed replays identically", () => {
    const a = playSession("det-1");
    const b = playSession("det-1");
    expect(a.bank).toBe(b.bank);
    expect(a.launched).toBe(b.launched);
    expect(a.feverCount).toBe(b.feverCount);
    expect(ballTrace(a)).toBe(ballTrace(b));
  });

  test("a different seed diverges", () => {
    const a = playSession("det-1");
    const c = playSession("det-2");
    expect(ballTrace(a)).not.toBe(ballTrace(c));
  });
});
