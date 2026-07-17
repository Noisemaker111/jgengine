import { describe, expect, test } from "bun:test";

import { decodeEditorBridgeRequest, EDITOR_BRIDGE_METHOD_NAMES } from "./rpcRequest";

describe("decodeEditorBridgeRequest", () => {
  test("a valid request passes through typed", () => {
    const decoded = decodeEditorBridgeRequest({ method: "get_marker", id: "m1" });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("expected decode success");
    expect(decoded.request).toEqual({ method: "get_marker", id: "m1" });
  });

  test("a request with no method field is rejected with a path-specific diagnostic", () => {
    const decoded = decodeEditorBridgeRequest({ id: "m1" });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    expect(decoded.errors).toEqual([{ path: "$.method", message: "expected a string" }]);
  });

  test("a request with an unknown method is rejected", () => {
    const decoded = decodeEditorBridgeRequest({ method: "delete_universe" });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    expect(decoded.errors).toEqual([{ path: "$.method", message: 'unknown method "delete_universe"' }]);
  });

  test.each([null, "scene_summary", 42, ["scene_summary"]])(
    "a non-object payload %p is rejected",
    (raw) => {
      const decoded = decodeEditorBridgeRequest(raw);
      expect(decoded.ok).toBe(false);
      if (decoded.ok) throw new Error("expected decode failure");
      expect(decoded.errors).toEqual([{ path: "$", message: "expected an RPC request object" }]);
    },
  );

  test("a wrong-typed scalar field is rejected with a path-specific diagnostic", () => {
    const decoded = decodeEditorBridgeRequest({ method: "set_transform", id: "m1", x: "not-a-number" });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    expect(decoded.errors).toEqual([{ path: "$.x", message: "expected a number" }]);
  });

  test("a scalar where an object belongs is rejected before reaching the session", () => {
    const decoded = decodeEditorBridgeRequest({ method: "push_document_patch", patch: "oops" });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    expect(decoded.errors).toEqual([{ path: "$.patch", message: "expected an object" }]);
  });

  test("a non-array where an id list belongs is rejected", () => {
    const decoded = decodeEditorBridgeRequest({ method: "select", ids: "m1" });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    expect(decoded.errors).toEqual([{ path: "$.ids", message: "expected an array of strings" }]);
  });

  test("an out-of-range enum value is rejected", () => {
    const decoded = decodeEditorBridgeRequest({ method: "set_mode", mode: "flycam" });
    expect(decoded.ok).toBe(false);
    if (decoded.ok) throw new Error("expected decode failure");
    expect(decoded.errors).toEqual([{ path: "$.mode", message: "expected one of edit | walk | play" }]);
  });

  test("a nullable field accepts null", () => {
    expect(decodeEditorBridgeRequest({ method: "fill_terrain", surface: null }).ok).toBe(true);
    expect(decodeEditorBridgeRequest({ method: "set_parent", ids: ["a"], parentId: null }).ok).toBe(true);
  });

  test("missing fields are left for handle to guard (forward-compatible boundary)", () => {
    // No `id` — the decoder does not enforce presence; handle returns an honest not-found.
    expect(decodeEditorBridgeRequest({ method: "get_marker" }).ok).toBe(true);
    // Unknown extra fields are ignored.
    expect(decodeEditorBridgeRequest({ method: "scene_summary", extra: 1 }).ok).toBe(true);
  });

  test("every method carries a field schema (lockstep with the union)", () => {
    // The Record<method, …> type enforces this at compile time; assert it holds at runtime too.
    expect(EDITOR_BRIDGE_METHOD_NAMES.length).toBeGreaterThan(80);
    for (const method of EDITOR_BRIDGE_METHOD_NAMES) {
      expect(decodeEditorBridgeRequest({ method }).ok).toBe(true);
    }
  });
});
