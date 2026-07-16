import { describe, expect, test } from "bun:test";

import { createEditorHost } from "../session";
import { routeToolCall, routeToolCalls, toolCallToRequest } from "./toolBridge";

describe("toolCallToRequest", () => {
  test("maps tool name to RPC method and merges arguments", () => {
    const built = toolCallToRequest({
      id: "c1",
      name: "set_transform",
      arguments: { id: "m1", x: 1, y: 2, z: 3 },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error("expected ok");
    expect(built.request).toEqual({ method: "set_transform", id: "m1", x: 1, y: 2, z: 3 });
  });

  test("rejects unknown methods via decodeEditorBridgeRequest", () => {
    const built = toolCallToRequest({ id: "c2", name: "delete_universe", arguments: {} });
    expect(built.ok).toBe(false);
    if (built.ok) throw new Error("expected fail");
    expect(built.error).toContain("unknown method");
  });
});

describe("routeToolCall", () => {
  test("mutating tools go through host.handle and share undo history", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [{ id: "boss", kind: "boss", position: { x: 0, y: 0, z: 0 } }],
      },
    });

    const moved = routeToolCall(api, {
      id: "t1",
      name: "set_transform",
      arguments: { id: "boss", x: 5, y: 0, z: -10 },
    });
    expect(moved.ok).toBe(true);
    expect(moved.mutated).toBe(true);
    expect(moved.patchSummary).toContain("set_transform");
    expect(moved.patchSummary).toContain("boss");

    const marker = api.getSession().getState().document.markers.find((m) => m.id === "boss");
    expect(marker?.position).toEqual({ x: 5, y: 0, z: -10 });
    expect(api.getSession().canUndo()).toBe(true);

    const undid = routeToolCall(api, { id: "t2", name: "undo", arguments: {} });
    expect(undid.ok).toBe(true);
    expect(undid.mutated).toBe(true);
    const restored = api.getSession().getState().document.markers.find((m) => m.id === "boss");
    expect(restored?.position).toEqual({ x: 0, y: 0, z: 0 });

    dispose();
  });

  test("read-only tools do not mark mutated", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: { markers: [{ id: "a", kind: "spawn", position: { x: 0, y: 0, z: 0 } }] },
    });
    const status = routeToolCall(api, { id: "r1", name: "editor_status", arguments: {} });
    expect(status.ok).toBe(true);
    expect(status.mutated).toBe(false);
    expect(status.patchSummary).toContain("(read)");
    dispose();
  });

  test("unknown tool name fails without touching the document", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: { markers: [{ id: "a", kind: "spawn", position: { x: 0, y: 0, z: 0 } }] },
    });
    const before = api.getSession().exportJson(false);
    const bad = routeToolCall(api, { id: "b1", name: "explode", arguments: {} });
    expect(bad.ok).toBe(false);
    expect(bad.mutated).toBe(false);
    expect(api.getSession().exportJson(false)).toBe(before);
    dispose();
  });

  test("routeToolCalls preserves order", () => {
    const { api, dispose } = createEditorHost({
      gameId: "test",
      layers: {
        markers: [
          { id: "a", kind: "spawn", position: { x: 0, y: 0, z: 0 } },
          { id: "b", kind: "spawn", position: { x: 1, y: 0, z: 1 } },
        ],
      },
    });
    const results = routeToolCalls(api, [
      { id: "1", name: "set_transform", arguments: { id: "a", x: 10, y: 0, z: 0 } },
      { id: "2", name: "set_transform", arguments: { id: "b", x: 20, y: 0, z: 0 } },
      { id: "3", name: "list_selection", arguments: {} },
    ]);
    expect(results.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(results[0]?.mutated).toBe(true);
    expect(results[1]?.mutated).toBe(true);
    expect(results[2]?.mutated).toBe(false);
    dispose();
  });
});
