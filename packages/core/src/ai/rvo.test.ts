import { describe, expect, test } from "bun:test";
import { devtools } from "@jgengine/core/devtools/devtools";
import { createRvoCrowd, type RvoSnapshot } from "@jgengine/core/world";

function drive(crowd: ReturnType<typeof createRvoCrowd>, ticks: number, preferred: (id: string) => [number, number]): number {
  let minGap = Infinity;
  const ids = crowd.ids();
  for (let t = 0; t < ticks; t += 1) {
    for (const id of ids) {
      const [vx, vz] = preferred(id);
      crowd.setPreferredVelocity(id, vx, vz);
    }
    crowd.step(1 / 60);
    for (let i = 0; i < ids.length; i += 1) {
      const a = crowd.agent(ids[i]!)!;
      for (let j = i + 1; j < ids.length; j += 1) {
        const b = crowd.agent(ids[j]!)!;
        minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z));
      }
    }
  }
  return minGap;
}

describe("createRvoCrowd", () => {
  test("head-on agents pass each other instead of colliding or stopping", () => {
    const crowd = createRvoCrowd({ neighborDist: 4, maxNeighbors: 6 });
    crowd.add("a", { x: -2, z: 0, radius: 0.4, maxSpeed: 1.5 });
    crowd.add("b", { x: 2, z: 0, radius: 0.4, maxSpeed: 1.5 });
    const minGap = drive(crowd, 480, (id) => (id === "a" ? [1.5, 0] : [-1.5, 0]));
    const a = crowd.agent("a")!;
    const b = crowd.agent("b")!;
    expect(a.x).toBeGreaterThan(4);
    expect(b.x).toBeLessThan(-4);
    expect(Math.abs(a.z - b.z)).toBeGreaterThan(0.4);
    expect(minGap).toBeGreaterThanOrEqual(0.4 * 2 - 0.02);
    crowd.dispose();
  });

  test("two crossing streams keep their distance and both reach the far side", () => {
    const crowd = createRvoCrowd({ neighborDist: 3, maxNeighbors: 8 });
    for (let i = 0; i < 8; i += 1) {
      crowd.add(`x${i}`, { x: -6, z: -4 + i * 1.1, radius: 0.35, maxSpeed: 1.2 });
      crowd.add(`z${i}`, { x: -4 + i * 1.1, z: -6, radius: 0.35, maxSpeed: 1.2 });
    }
    const minGap = drive(crowd, 720, (id) => (id.startsWith("x") ? [1.2, 0] : [0, 1.2]));
    for (let i = 0; i < 8; i += 1) {
      expect(crowd.agent(`x${i}`)!.x).toBeGreaterThan(2);
      expect(crowd.agent(`z${i}`)!.z).toBeGreaterThan(2);
    }
    expect(minGap).toBeGreaterThan(0.35 * 2 * 0.9);
    crowd.dispose();
  });

  test("never exceeds an agent's top speed and never produces NaN while packed", () => {
    const crowd = createRvoCrowd({ neighborDist: 2, maxNeighbors: 4 });
    for (let i = 0; i < 40; i += 1) {
      crowd.add(`a${i}`, { x: (i % 8) * 0.9, z: Math.floor(i / 8) * 0.9, radius: 0.4, maxSpeed: 1.1 });
    }
    for (let t = 0; t < 240; t += 1) {
      for (const id of crowd.ids()) crowd.setPreferredVelocity(id, 1.1, 0);
      crowd.step(1 / 60);
      for (const id of crowd.ids()) {
        const agent = crowd.agent(id)!;
        expect(Number.isFinite(agent.x) && Number.isFinite(agent.z)).toBe(true);
        expect(Math.hypot(agent.vx, agent.vz)).toBeLessThanOrEqual(1.1 + 1e-6);
      }
    }
    crowd.dispose();
  });

  test("is deterministic for the same commands", () => {
    const build = () => {
      const crowd = createRvoCrowd({ neighborDist: 3, maxNeighbors: 6 });
      for (let i = 0; i < 24; i += 1) {
        crowd.add(`a${i}`, { x: Math.cos(i) * 3, z: Math.sin(i) * 3, radius: 0.35, maxSpeed: 1.3 });
      }
      const snapshot = (): RvoSnapshot => {
        drive(crowd, 180, (id) => {
          const index = Number(id.slice(1));
          return [-Math.sin(index), Math.cos(index)];
        });
        return crowd.snapshot();
      };
      return snapshot();
    };
    expect(build()).toEqual(build());
  });

  test("snapshot and restore resume the same motion", () => {
    const crowd = createRvoCrowd({ neighborDist: 3, maxNeighbors: 6, timeHorizon: 1.5 });
    for (let i = 0; i < 12; i += 1) crowd.add(`a${i}`, { x: i * 0.5, z: 0, radius: 0.4, maxSpeed: 1.2 });
    const preferred = (id: string): [number, number] => [1.2, Math.sin(Number(id.slice(1))) * 0.2];
    drive(crowd, 60, preferred);
    const saved = crowd.snapshot();
    drive(crowd, 120, preferred);
    const after = crowd.snapshot();
    crowd.restore(saved);
    expect(crowd.snapshot()).toEqual(saved);
    drive(crowd, 120, preferred);
    expect(crowd.snapshot()).toEqual(after);
    crowd.dispose();
  });

  test("adds, removes and retunes without losing the other agents", () => {
    const crowd = createRvoCrowd({ devtoolsName: "test.rvo" });
    expect(crowd.add("a", { x: 0, z: 0, radius: 0.4, maxSpeed: 1 })).toBe(true);
    expect(crowd.add("a", { x: 1, z: 1, radius: 0.4, maxSpeed: 1 })).toBe(false);
    expect(crowd.add("b", { x: 1, z: 0, radius: 0.4, maxSpeed: 1 })).toBe(true);
    expect(crowd.count()).toBe(2);
    crowd.retune({ maxNeighbors: 2, neighborDist: 5 });
    crowd.step(1 / 60);
    expect(crowd.remove("a")).toBe(true);
    expect(crowd.remove("a")).toBe(false);
    expect(crowd.ids()).toEqual(["b"]);
    expect(crowd.agent("a")).toBeNull();
    expect(String((devtools.probes.read() as Record<string, unknown>)["test.rvo"])).toContain("1 agents 1 ticks");
    crowd.dispose();
    expect((devtools.probes.read() as Record<string, unknown>)["test.rvo"]).toBeUndefined();
  });
});
