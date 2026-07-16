import { describe, expect, test } from "bun:test";

import { createEditorHost } from "../session";
import { formatAgentContext, packAgentContext } from "./context";

describe("packAgentContext", () => {
  test("packs selection, mode, focus, undo flags, and counts", () => {
    const { api, dispose } = createEditorHost({
      gameId: "arena",
      layers: {
        markers: [
          { id: "spawn_a", kind: "spawn", position: { x: 1, y: 0, z: 2 } },
          { id: "spawn_b", kind: "spawn", position: { x: 3, y: 0, z: 4 } },
        ],
        volumes: [{ id: "zone", kind: "zone", shape: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 5 }],
      },
    });

    api.getSession().dispatch({ type: "select", ids: ["spawn_a"] });
    api.setMode("walk");
    api.setFocusTarget({ x: 10, y: 1, z: -3 });
    api.handle({ method: "set_transform", id: "spawn_a", x: 9, y: 0, z: 2 });

    const context = packAgentContext(api);
    expect(context.gameId).toBe("arena");
    expect(context.mode).toBe("walk");
    expect(context.selection).toEqual(["spawn_a"]);
    expect(context.focus).toEqual({ x: 10, y: 1, z: -3 });
    expect(context.canUndo).toBe(true);
    expect(context.canRedo).toBe(false);
    expect(context.summary).toEqual({ markers: 2, volumes: 1, paths: 0, annotations: 0 });

    const formatted = formatAgentContext(context);
    expect(formatted).toContain("gameId=arena");
    expect(formatted).toContain("mode=walk");
    expect(formatted).toContain("selection=[spawn_a]");
    expect(formatted).toContain("focus=(10.0, 1.0, -3.0)");
    expect(formatted).toContain("markers:2");
    expect(formatted).toContain("undo:yes");

    dispose();
  });

  test("empty selection and null focus serialize cleanly", () => {
    const { api, dispose } = createEditorHost({ gameId: "empty", layers: {} });
    const context = packAgentContext(api);
    expect(context.selection).toEqual([]);
    expect(context.focus).toBeNull();
    expect(formatAgentContext(context)).toContain("selection=[(none)]");
    expect(formatAgentContext(context)).toContain("focus=none");
    dispose();
  });
});
