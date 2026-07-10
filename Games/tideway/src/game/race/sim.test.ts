import { describe, expect, test } from "bun:test";
import { racerIds } from "../boats/catalog";
import { createSim, resetSim } from "./sim";

describe("sim lifecycle", () => {
  test("createSim seeds one boat state per racer and a fresh race", () => {
    const sim = createSim("skipper-1");
    expect(sim.status).toBe("start");
    expect(sim.raceStartSec).toBeNull();
    expect(sim.outcome).toBeNull();
    expect(sim.ids).toEqual(racerIds("skipper-1"));
    expect(sim.boats.has("skipper-1")).toBe(true);
    expect(sim.rivalFollowById.size).toBe(sim.ids.length - 1);
    expect(sim.raceState.standings().length).toBe(sim.ids.length);
  });

  test("resetSim rebuilds a clean sim for the same player with no leftover progress", () => {
    const sim = createSim("skipper-1");
    sim.status = "racing";
    sim.raceStartSec = 12;
    sim.raceState.update(20, { "skipper-1": [sim.boats.get("skipper-1")!.x, 0.6, sim.boats.get("skipper-1")!.z] });

    const fresh = resetSim(sim);

    expect(fresh.status).toBe("start");
    expect(fresh.raceStartSec).toBeNull();
    expect(fresh.playerId).toBe(sim.playerId);
    expect(fresh.raceState.standings().every((row) => row.progress === 0)).toBe(true);
  });

  test("two sims built for the same player id are structurally identical (deterministic)", () => {
    const a = createSim("skipper-9");
    const b = createSim("skipper-9");
    expect(a.ids).toEqual(b.ids);
    expect(a.boats.get("skipper-9")).toEqual(b.boats.get("skipper-9"));
  });
});
