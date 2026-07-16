import { describe, expect, test } from "bun:test";

import { decodeEditorBridgeRequest } from "./rpcRequest";

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
});
