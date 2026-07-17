import { describe, expect, test } from "bun:test";

import {
  createAntiOneShotPolicy,
  createDamagePipeline,
  createImmunityWindow,
} from "./damageInterceptors";
import { createThresholdTracker } from "./thresholdCrossings";

/**
 * Executable first-adopter proof for #931: the interception seam and the
 * threshold tracker compose into three genre-agnostic consumers without any
 * boss-specific engine branch — player anti-one-shot, a multi-phase encounter,
 * and a non-health (resource warning) threshold consumer.
 */

describe("adoption: player anti-one-shot", () => {
  test("a full-HP player survives a one-shot but a chipped player can still die", () => {
    const pipeline = createDamagePipeline();
    const antiOneShot = createAntiOneShotPolicy({ guardAboveFraction: 0.5, leaveFraction: 0.15, recoverMs: 800 });
    pipeline.install(antiOneShot.interceptor);

    let hp = 100;
    const ctx = (nowMs: number) => ({ nowMs, healthOf: () => ({ current: hp, max: 100 }) });
    const apply = (amount: number, nowMs: number) => {
      const res = pipeline.resolve({ target: "player", source: "boss", amount }, ctx(nowMs));
      for (const a of res.applications) hp = Math.max(0, hp - a.amount);
      return res;
    };

    apply(500, 0); // full HP: clamped to leave 15
    expect(hp).toBe(15);
    expect(antiOneShot.immune("player", 400)).toBe(true);

    // While in recovery i-frames a follow-up whiffs entirely.
    apply(500, 400);
    expect(hp).toBe(15);

    // Once recovery lapses and the player is below the guard fraction, a hit is lethal.
    apply(500, 900);
    expect(hp).toBe(0);
  });
});

describe("adoption: multi-phase boss encounter", () => {
  test("HP thresholds drive phase transitions that install and remove an invuln window", () => {
    const pipeline = createDamagePipeline();
    const invuln = createImmunityWindow("phase-invuln");

    // Boss HP percent tracker: enter phase 2 at 66%, phase 3 at 33%, once each.
    const phases = createThresholdTracker({
      thresholds: [
        { id: "phase2", at: 66 },
        { id: "phase3", at: 33 },
      ],
      trigger: "falling",
      policy: "once",
      initial: 100,
    });

    const events: string[] = [];
    let now = 0;
    function onPhase(percent: number): void {
      for (const crossing of phases.update(percent)) {
        events.push(crossing.id);
        // Each phase transition installs a brief invulnerability, an ordinary damage policy.
        invuln.grantFor("boss", now, 1000);
      }
    }

    let bossHp = 100;
    const damageBoss = (amount: number) => {
      const res = pipeline.resolve({ target: "boss", source: "player", amount }, { nowMs: now });
      for (const a of res.applications) bossHp = Math.max(0, bossHp - a.amount);
      onPhase(bossHp);
      return res;
    };

    pipeline.install(invuln.interceptor);

    damageBoss(30); // 100 → 70, no phase yet
    expect(events).toEqual([]);
    expect(bossHp).toBe(70);

    damageBoss(10); // 70 → 60, crosses 66 → phase2, invuln armed at now=0 until 1000
    expect(events).toEqual(["phase2"]);

    // Boss is invulnerable during the transition window.
    now = 500;
    expect(damageBoss(20).applications).toEqual([]);
    expect(bossHp).toBe(60);

    // After the window, damage lands again and can cross into phase 3.
    now = 1000;
    damageBoss(40); // 60 → 20, crosses 33 → phase3
    expect(events).toEqual(["phase2", "phase3"]);
    expect(bossHp).toBe(20);
  });
});

describe("adoption: non-health threshold consumer", () => {
  test("a stamina pool crosses a low-resource warning both ways", () => {
    const stamina = createThresholdTracker({
      thresholds: [{ id: "low-stamina", at: 20 }],
      initial: 100,
    });
    const alerts: string[] = [];
    const observe = (value: number) => {
      for (const c of stamina.update(value)) alerts.push(`${c.id}:${c.direction}`);
    };

    observe(50);
    observe(15); // drops below 20
    observe(35); // recovers above 20
    expect(alerts).toEqual(["low-stamina:falling", "low-stamina:rising"]);
  });
});
