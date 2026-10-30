import { describe, expect, test } from "bun:test";
import { expandWave } from "@jgengine/core/waves/encounter";

import { advanceBossPhase, bossPhaseAt, bossProfile, createBossPhaseState, DIRECTOR_SEED, ENCOUNTER, TOTAL_WAVES, WARDEN_ID } from "./manifest";

describe("wave manifest", () => {
  test("declares the authored host with a boss wave last", () => {
    expect(TOTAL_WAVES).toBeGreaterThanOrEqual(3);
    expect(ENCOUNTER.waves[TOTAL_WAVES - 1]!.groups.some((group) => group.unit === "raider_warden")).toBe(true);
  });

  test("every wave names a unit, an entry and a positive count", () => {
    for (const wave of ENCOUNTER.waves) {
      expect(wave.groups.length).toBeGreaterThan(0);
      for (const group of wave.groups) {
        expect(group.unit.length).toBeGreaterThan(0);
        expect(group.entry.length).toBeGreaterThan(0);
        expect(group.count ?? 1).toBeGreaterThan(0);
      }
    }
  });

  test("nothing dumps at t=0: later groups walk on after the first", () => {
    const first = expandWave({ definition: ENCOUNTER, seed: DIRECTOR_SEED }, 2);
    const atZero = first.filter((order) => order.atSeconds === 0);
    const later = first.filter((order) => order.atSeconds > 0);
    expect(atZero.length).toBeGreaterThan(0);
    expect(later.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(12);
  });

  test("pressure can thicken a wave but never changes the authored units", () => {
    const wave = ENCOUNTER.waves[3]!;
    const plain = expandWave({ definition: ENCOUNTER, seed: DIRECTOR_SEED }, 3);
    const pressed = expandWave({ definition: ENCOUNTER, seed: DIRECTOR_SEED }, 3, { countBonus: 2, eliteSlots: 1 });
    const escalating = wave.groups.filter((group) => group.escalates === true).length;
    const authored = new Set(plain.map((order) => order.unit));
    for (const order of pressed) expect(authored.has(order.unit)).toBe(true);
    expect(pressed.length - plain.length).toBe(escalating * 2);
    expect(pressed.filter((order) => order.pressureAdded).length).toBe(escalating * 2);
  });
});

describe("a boss's phase clock", () => {
  const profile = bossProfile(WARDEN_ID);

  test("health at a threshold counts as that phase, and the list runs high to low", () => {
    if (profile === null) throw new Error("the Warden has no profile");
    expect(profile.phases[0]?.atHealth).toBe(1);
    let previous = 1;
    for (const phase of profile.phases) {
      expect(phase.atHealth).toBeLessThanOrEqual(previous);
      previous = phase.atHealth;
    }
    expect(bossPhaseAt(profile.phases, "opening", 0.6).id).toBe("enraged");
    expect(bossPhaseAt(profile.phases, "opening", 0.6001).id).toBe("opening");
    expect(bossPhaseAt(profile.phases, "opening", 0.25).id).toBe("last-stand");
    expect(bossPhaseAt(profile.phases, "opening", 0).id).toBe("last-stand");
  });

  test("a heal stays in the phase it reached, and odd health stays inside the list", () => {
    if (profile === null) throw new Error("the Warden has no profile");
    const state = createBossPhaseState(profile.phases);
    const deep = advanceBossPhase(profile.phases, state, 0.1, 0.016);
    expect(deep.changed).toBe(true);
    expect(deep.phase.id).toBe("last-stand");
    expect(deep.state.tellId).toBe("dig-in");
    const healed = advanceBossPhase(profile.phases, deep.state, 1, 0.016);
    expect(healed.changed).toBe(false);
    expect(healed.phase.id).toBe("last-stand");
    const odd = advanceBossPhase(profile.phases, state, Number.NaN, 0.016);
    expect(odd.changed).toBe(false);
    expect(odd.phase.id).toBe("opening");
  });

  test("a long frame still lands on the deepest phase, and the tell expires on its own", () => {
    if (profile === null) throw new Error("the Warden has no profile");
    const state = createBossPhaseState(profile.phases);
    const huge = advanceBossPhase(profile.phases, state, 0.01, 1e9);
    expect(huge.phase.id).toBe("last-stand");
    expect(huge.tell?.id).toBe("dig-in");
    const later = advanceBossPhase(profile.phases, huge.state, 0.01, 3);
    expect(later.changed).toBe(false);
    expect(later.state.tellId).toBeNull();
  });
});
