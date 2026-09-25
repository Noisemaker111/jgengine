import { describe, expect, test } from "bun:test";
import { initNavBake } from "@jgengine/navbake";

import { createEditorHost } from "../session";

describe("bakeNavMesh", () => {
  test("stores the baked mesh as a named nav bake", async () => {
    const host = createEditorHost({ gameId: "navbake-test", layers: undefined });
    await initNavBake();
    const response = host.api.handle({
      method: "bakeNavMesh",
      id: "ground",
      positions: [0, 0, 0, 6, 0, 0, 6, 0, 6, 0, 0, 6],
      indices: [0, 2, 1, 0, 3, 2],
      agentRadius: 0.4,
      agentHeight: 1.8,
      maxSlope: 45,
      maxClimb: 0.4,
    });
    expect(response.ok).toBe(true);
    const bake = host.api.getSession().getState().document.bakes?.find((entry) => entry.id === "ground");
    expect(bake?.kind).toBe("nav");
    expect((response.result as { polygons: number }).polygons).toBeGreaterThan(0);
    host.dispose();
  });
});
