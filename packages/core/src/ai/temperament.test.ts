import { describe, expect, test } from "bun:test";

import type { PerceptionMemory } from "../sensor/perception";
import { decideTemperament, type TemperamentInput } from "./temperament";

const memory = (x: number, z: number, cue: PerceptionMemory["cue"], confidence = 1): PerceptionMemory => ({
  targetId: "diver",
  lastKnownPos: [x, 0, z],
  lastSeenAt: 0,
  confidence,
  cue,
});

const at = (memories: PerceptionMemory[], extra: Partial<TemperamentInput> = {}): TemperamentInput => ({
  position: [0, 0, 0],
  home: [0, 0, 0],
  memories,
  ...extra,
});

describe("decideTemperament", () => {
  test("anything idles when it senses nothing; a territorial one walks home", () => {
    expect(decideTemperament({ kind: "predator" }, at([])).mode).toBe("idle");
    const away = decideTemperament({ kind: "territorial", territoryRadius: 6 }, at([], { position: [10, 0, 0] }));
    expect(away).toMatchObject({ mode: "return", goal: [0, 0, 0] });
  });

  test("a passive creature flees what comes near, directly away from it", () => {
    const intent = decideTemperament({ kind: "passive", fleeRange: 8 }, at([memory(3, 0, "sound")]));
    expect(intent.mode).toBe("flee");
    expect(intent.goal).toEqual([-8, 0, 0]);
    expect(decideTemperament({ kind: "passive", fleeRange: 8 }, at([memory(20, 0, "sight")])).mode).toBe("idle");
    expect(decideTemperament({ kind: "passive" }, at([memory(20, 0, "damage")])).mode).toBe("flee");
  });

  test("a territorial creature attacks intruders inside its ground and ignores those outside", () => {
    const config = { kind: "territorial" as const, territoryRadius: 6, attackRange: 2 };
    expect(decideTemperament(config, at([memory(4, 0, "sight")])).mode).toBe("stalk");
    expect(decideTemperament(config, at([memory(1, 0, "sight")])).mode).toBe("attack");
    expect(decideTemperament(config, at([memory(15, 0, "sight")])).mode).toBe("guard");
    expect(decideTemperament(config, at([memory(15, 0, "damage")])).mode).toBe("stalk");
  });

  test("a predator charges what it saw but only investigates a smell or a noise", () => {
    expect(decideTemperament({ kind: "predator" }, at([memory(10, 0, "sight")])).mode).toBe("stalk");
    const scent = decideTemperament({ kind: "predator" }, at([memory(10, 0, "scent")]));
    expect(scent).toMatchObject({ mode: "investigate", goal: [10, 0, 0], reason: "following a scent" });
    expect(decideTemperament({ kind: "predator" }, at([memory(10, 0, "sight", 0.2)])).mode).toBe("investigate");
    expect(decideTemperament({ kind: "predator", commitCues: ["sight", "scent"] }, at([memory(10, 0, "scent")])).mode).toBe("stalk");
  });

  test("light draws an attracted creature and drives an averse one off", () => {
    const lit = { lightOf: () => 1 };
    const dark = { lightOf: () => 0 };
    expect(decideTemperament({ kind: "predator", light: "attracted" }, at([memory(10, 0, "sound")], lit)).mode).toBe("stalk");
    expect(decideTemperament({ kind: "predator", light: "attracted" }, at([memory(10, 0, "sound")], dark)).mode).toBe("investigate");
    expect(decideTemperament({ kind: "predator", light: "averse" }, at([memory(3, 0, "sight")], lit)).mode).toBe("flee");
    expect(decideTemperament({ kind: "passive", light: "attracted" }, at([memory(20, 0, "sight")], lit)).mode).toBe("investigate");
  });

  test("a badly hurt creature breaks off, and the most confident memory leads", () => {
    expect(decideTemperament({ kind: "predator" }, at([memory(1, 0, "sight")], { health: 0.1 })).mode).toBe("flee");
    expect(decideTemperament({ kind: "predator", breakAt: 0 }, at([memory(1, 0, "sight")], { health: 0.1 })).mode).toBe("attack");
    const intent = decideTemperament({ kind: "predator" }, at([memory(10, 0, "scent", 0.3), { ...memory(0, 1, "sight", 0.9), targetId: "lure" }]));
    expect(intent).toMatchObject({ mode: "attack", targetId: "lure" });
  });
});
