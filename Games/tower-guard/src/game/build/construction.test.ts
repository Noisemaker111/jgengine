import { describe, expect, test } from "bun:test";
import { createWorkQueue, enqueue, tick } from "@jgengine/core/gameplay";

import { towerBuildConfig, type TowerBuildSpec, type TowerReservation } from "./construction";

const spec: TowerBuildSpec = {
  towerId: "tower_archer",
  plotId: "plot-1",
  instanceId: "tower-1",
  position: { x: 3, y: 0, z: 4 },
  userId: "player-1",
};

describe("tower-guard construction queue", () => {
  test("reserves the tower's gold cost when queued", () => {
    const state = createWorkQueue<TowerBuildSpec, TowerReservation>();
    const queued = enqueue(state, towerBuildConfig, spec);
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    expect(queued.job.reservation).toEqual({ userId: "player-1", cost: 50 });
  });

  test("an instant tower (no buildSeconds) completes on the first tick and routes a spawn order", () => {
    let state = createWorkQueue<TowerBuildSpec, TowerReservation>();
    state = enqueue(state, towerBuildConfig, spec).state;
    const result = tick(state, towerBuildConfig, 0.016);
    const completed = result.events.find((event) => event.type === "completed");
    expect(completed?.type).toBe("completed");
    if (completed?.type !== "completed") return;
    expect(completed.output.towerId).toBe("tower_archer");
    expect(completed.output.instanceId).toBe("tower-1");
    expect(completed.output.plotId).toBe("plot-1");
  });
});
