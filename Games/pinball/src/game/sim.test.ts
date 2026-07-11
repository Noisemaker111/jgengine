import { describe, expect, test } from "bun:test";

import { BALLS_PER_GAME } from "./config";
import { PinballSim } from "./sim";
import type { StepInput } from "./sim";

const IDLE: StepInput = { left: false, right: false, plunger: false };

function playing(seed = "test"): PinballSim {
  const s = new PinballSim({ seed });
  s.phase = "play";
  return s;
}

function dropAllTargets(s: PinballSim): void {
  for (const d of s.table.dropTargets) {
    const cx = (d.ax + d.bx) / 2;
    s.ball.x = cx;
    s.ball.y = d.ay - 6;
    s.ball.vx = 0;
    s.ball.vy = 60;
    s.step(0.002, IDLE);
  }
}

function lightLane(s: PinballSim, i: number): void {
  const l = s.table.rollovers[i]!;
  s.ball.x = (l.x0 + l.x1) / 2;
  s.ball.y = (l.y0 + l.y1) / 2;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.step(0.002, IDLE);
}

describe("drop-target bank state machine", () => {
  test("hitting a target drops it", () => {
    const s = playing();
    const first = s.table.dropTargets[0]!;
    s.ball.x = (first.ax + first.bx) / 2;
    s.ball.y = first.ay - 6;
    s.ball.vy = 60;
    s.step(0.002, IDLE);
    expect(first.up).toBe(false);
    expect(s.score).toBeGreaterThan(0);
  });

  test("clearing the bank lights the spot bonus and resets the targets", () => {
    const s = playing();
    dropAllTargets(s);
    expect(s.dropCompletions).toBe(1);
    expect(s.spotBonusLit).toBe(true);
    expect(s.table.dropTargets.every((d) => d.up)).toBe(true);
    expect(s.extraBallLit).toBe(false);
  });

  test("the third completion lights EXTRA BALL and awards a ball", () => {
    const s = playing();
    expect(s.ballsRemaining).toBe(BALLS_PER_GAME);
    dropAllTargets(s);
    dropAllTargets(s);
    dropAllTargets(s);
    expect(s.dropCompletions).toBe(3);
    expect(s.extraBallLit).toBe(true);
    expect(s.ballsRemaining).toBe(BALLS_PER_GAME + 1);
  });
});

describe("rollover + multiplier state machine", () => {
  test("rolling a lane lights it", () => {
    const s = playing();
    lightLane(s, 0);
    expect(s.rolloverLit[0]).toBe(true);
    expect(s.rolloverLit[1]).toBe(false);
  });

  test("completing A-L-L advances the bonus multiplier and resets the lanes", () => {
    const s = playing();
    expect(s.multiplier()).toBe(1);
    lightLane(s, 0);
    lightLane(s, 1);
    lightLane(s, 2);
    expect(s.multiplierIndex).toBe(1);
    expect(s.multiplier()).toBe(2);
    expect(s.rolloverLit.every((v) => !v)).toBe(true);
  });

  test("the multiplier climbs 2x -> 3x -> 5x and caps", () => {
    const s = playing();
    const complete = () => {
      lightLane(s, 0);
      lightLane(s, 1);
      lightLane(s, 2);
    };
    complete();
    expect(s.multiplier()).toBe(2);
    complete();
    expect(s.multiplier()).toBe(3);
    complete();
    expect(s.multiplier()).toBe(5);
    complete();
    expect(s.multiplier()).toBe(5); // capped
  });

  test("flipper buttons cycle the lit lane pattern", () => {
    const s = playing();
    lightLane(s, 0); // [true, false, false]
    // move the ball clear of every lane so the sensor doesn't re-light lane 0 this step
    s.ball.x = 108;
    s.ball.y = 200;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.step(0.002, { left: true, right: false, plunger: false }); // rising edge cycles
    expect(s.rolloverLit.filter((v) => v).length).toBe(1); // exactly one lamp, rotated
    expect(s.rolloverLit[0]).toBe(false); // moved off lane 0
    expect(s.rolloverLit[2]).toBe(true); // rotated to lane 2
  });
});

describe("end-of-ball bonus", () => {
  test("end-of-ball bonus = multiplier x accumulated bonus", () => {
    const s = playing();
    // build multiplier to 2x and some accumulated bonus via rollovers
    lightLane(s, 0);
    lightLane(s, 1);
    lightLane(s, 2); // completion: +2 bonus, multiplier 2x
    const bonusUnits = s.accBonus;
    const mult = s.multiplier();
    const before = s.score;
    // drain the ball (past the saver window)
    s.ballTimer = 10;
    s.ball.x = 108;
    s.ball.y = 500;
    s.ball.vy = 200;
    s.step(0.002, IDLE);
    expect(s.lastEndBonus).toBe(mult * bonusUnits);
    expect(s.score).toBe(before + mult * bonusUnits);
  });
});

describe("ball saver", () => {
  test("a drain inside the saver window re-serves the same ball", () => {
    const s = playing();
    s.ballIndex = 1;
    s.ballsRemaining = BALLS_PER_GAME;
    s.ballTimer = 1; // within the 5s window
    s.ball.x = 108;
    s.ball.y = 500;
    s.ball.vy = 200;
    s.step(0.002, IDLE);
    expect(s.ballsRemaining).toBe(BALLS_PER_GAME); // no ball lost
    expect(s.phase).toBe("ready"); // re-served to the plunger
  });
});

describe("tilt lockout", () => {
  test("three nudges tilt the table and lock the flippers", () => {
    const s = playing();
    s.ball.y = 200;
    expect(s.tilted).toBe(false);
    s.nudge();
    expect(s.tiltCount).toBe(1);
    expect(s.tilted).toBe(false);
    s.nudge();
    expect(s.tiltCount).toBe(2);
    s.nudge();
    expect(s.tilted).toBe(true);

    const lf = s.table.flippers[0];
    for (let i = 0; i < 8; i += 1) {
      s.ball.x = 108;
      s.ball.y = 200;
      s.ball.vx = 0;
      s.ball.vy = 0;
      s.step(0.01, { left: true, right: false, plunger: false });
    }
    expect(Math.abs(lf.angle - lf.rest)).toBeLessThan(0.05); // never raised
    expect(Math.abs(lf.angle - lf.active)).toBeGreaterThan(0.3);
  });

  test("a nudge while tilted is ignored", () => {
    const s = playing();
    s.ball.y = 200;
    s.nudge();
    s.nudge();
    s.nudge();
    expect(s.tilted).toBe(true);
    s.nudge();
    expect(s.tiltCount).toBe(3);
  });
});

function fingerprint(seed: string): string {
  const s = new PinballSim({ seed });
  for (let frame = 0; frame < 420; frame += 1) {
    if (frame % 47 === 0 && frame > 40) s.nudge();
    s.step(1 / 60, {
      left: frame % 24 < 12,
      right: frame % 24 >= 12,
      plunger: frame < 9,
    });
  }
  return [
    s.score,
    s.ballIndex,
    s.ballsRemaining,
    s.multiplierIndex,
    s.dropCompletions,
    s.tiltCount,
    Math.round(s.ball.x * 1000),
    Math.round(s.ball.y * 1000),
    Math.round(s.ball.vx * 1000),
    Math.round(s.ball.vy * 1000),
  ].join("|");
}

describe("deterministic replay under a fixed seed", () => {
  test("identical seed + identical inputs reproduce the exact run", () => {
    expect(fingerprint("bally-1978")).toBe(fingerprint("bally-1978"));
  });

  test("a different seed diverges (RNG actually drives the sim)", () => {
    expect(fingerprint("bally-1978")).not.toBe(fingerprint("gottlieb-1979"));
  });
});
