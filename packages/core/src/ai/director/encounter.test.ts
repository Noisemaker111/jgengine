import { describe, expect, test } from "bun:test";

import {
  createEncounter,
  expandWave,
  type EncounterConfig,
  type EncounterDefinition,
} from "@jgengine/core/ai/director/encounter";

const definition: EncounterDefinition = {
  id: "bastion",
  waves: [
    {
      id: "probe",
      label: "Probe",
      durationSeconds: 4,
      groups: [
        { unit: "scout", entry: "north", count: 2, at: 0 },
        { unit: "grunt", entry: "north", count: 1, at: 2 },
      ],
    },
    {
      id: "push",
      label: "Push",
      durationSeconds: 6,
      groups: [
        { unit: "grunt", entry: "north", count: 2, at: 0, escalates: true },
        { unit: "brute", entry: "east", count: 1, at: 1, elite: true, intent: "hold" },
        { unit: "scout", entry: "east", count: 1, at: 3 },
      ],
    },
    {
      id: "last",
      label: "Last",
      durationSeconds: 2,
      groups: [{ unit: "warden", entry: "north", count: 1, at: 0 }],
    },
  ],
};

const config: EncounterConfig = { definition, seed: 7 };

describe("encounters as data", () => {
  test("a wave expands to its authored composition, entry and timing", () => {
    const orders = expandWave(config, 0);
    expect(orders.map((order) => order.unit)).toEqual(["scout", "scout", "grunt"]);
    expect(orders.map((order) => order.atSeconds)).toEqual([0, 0, 2]);
    expect(orders.every((order) => order.entry === "north")).toBe(true);
    expect(orders.every((order) => order.intent === "assault")).toBe(true);
  });

  test("a wave that has not been reached sends nothing", () => {
    const encounter = createEncounter(config);
    expect(encounter.update(5)).toEqual([]);
    encounter.openWave();
    const first = encounter.update(0.1);
    expect(first).toHaveLength(2);
    const second = encounter.update(2.5);
    expect(second.map((order) => order.unit)).toEqual(["grunt"]);
  });

  test("pressure adds units only to groups that opt in, capped", () => {
    const plain = expandWave(config, 1, { countBonus: 2, eliteSlots: 1 });
    const grunts = plain.filter((order) => order.unit === "grunt");
    expect(grunts).toHaveLength(4);
    expect(grunts.filter((order) => order.pressureAdded)).toHaveLength(2);
    expect(plain.filter((order) => order.unit === "brute")).toHaveLength(1);
    const clamped = expandWave(config, 1, { countBonus: 99, eliteSlots: 1 });
    expect(clamped.filter((order) => order.unit === "grunt")).toHaveLength(6);
  });

  test("an elite group enters only when pressure unlocks a slot", () => {
    expect(expandWave(config, 1, { eliteSlots: 0 }).some((order) => order.unit === "brute")).toBe(false);
    expect(expandWave(config, 1, { eliteSlots: 1 }).some((order) => order.unit === "brute")).toBe(true);
  });

  test("pressure shortens authored delays but keeps their order", () => {
    const authored = expandWave(config, 1, { eliteSlots: 1 });
    const faster = expandWave(config, 1, { eliteSlots: 1, cadenceScale: 0.5 });
    expect(faster.find((order) => order.unit === "brute")!.atSeconds).toBeLessThan(
      authored.find((order) => order.unit === "brute")!.atSeconds,
    );
    for (let index = 1; index < faster.length; index += 1) {
      expect(faster[index]!.atSeconds).toBeGreaterThanOrEqual(faster[index - 1]!.atSeconds);
    }
  });

  test("the same seed gives the same schedule, a different one moves the scatter", () => {
    const scattered: EncounterDefinition = {
      id: "scatter",
      waves: [
        {
          id: "one",
          groups: [
            { unit: "scout", entry: "north", count: 6, at: 4, jitterSeconds: 2 },
            { unit: "grunt", entry: "east", count: 6, at: 4, jitterSeconds: 2 },
          ],
        },
      ],
    };
    const a = expandWave({ definition: scattered, seed: 11 }, 0);
    const b = expandWave({ definition: scattered, seed: 11 }, 0);
    const c = expandWave({ definition: scattered, seed: 12 }, 0);
    expect(a).toEqual(b);
    expect(a.map((order) => order.atSeconds)).not.toEqual(c.map((order) => order.atSeconds));
    expect(a.every((order) => order.atSeconds >= 2 && order.atSeconds <= 6)).toBe(true);
  });

  test("wave progress, readiness and completion follow the authored duration", () => {
    const encounter = createEncounter(config);
    encounter.openWave();
    expect(encounter.view().wave).toBe(1);
    expect(encounter.view().progress).toBe(0);
    encounter.update(1);
    expect(encounter.view().progress).toBeCloseTo(2 / 3, 5);
    encounter.update(1.5);
    expect(encounter.view().emitted).toBe(3);
    expect(encounter.view().ready).toBe(false);
    encounter.update(2);
    expect(encounter.view().ready).toBe(true);
    encounter.completeWave();
    expect(encounter.view().wave).toBe(2);
    expect(encounter.view().emitted).toBe(0);
  });

  test("the encounter finishes after the last wave", () => {
    const encounter = createEncounter(config);
    for (let wave = 0; wave < definition.waves.length; wave += 1) {
      encounter.openWave();
      encounter.update(10);
      encounter.completeWave();
    }
    expect(encounter.view().done).toBe(true);
    expect(encounter.view().ready).toBe(false);
    expect(encounter.openWave()).toEqual([]);
  });

  test("a save mid-wave restores the order it was in", () => {
    const live = createEncounter(config);
    live.openWave();
    live.update(1);
    const saved = live.snapshot();
    const resumed = createEncounter(config);
    resumed.restore(saved);
    expect(resumed.update(1.5)).toEqual(live.update(1.5));
    expect(resumed.view().emitted).toBe(live.view().emitted);
  });

  test("an unknown wave index opens nothing", () => {
    const encounter = createEncounter(config);
    expect(encounter.openWave(9)).toEqual([]);
    expect(encounter.waveAt(9)).toBeNull();
    expect(encounter.waveAt(0)?.id).toBe("probe");
  });
});
