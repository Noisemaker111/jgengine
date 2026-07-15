import { describe, expect, test } from "bun:test";

import { createEditorHost } from "./session";

/** #811 — headless meta-patch tools so agents can drive studio sliders via the RPC/CLI. */
describe("meta-patch RPC tools", () => {
  const host = () =>
    createEditorHost({
      gameId: "test",
      layers: {
        markers: [{ id: "m1", kind: "prop", position: { x: 0, y: 0, z: 0 } }],
        paths: [
          { id: "grove", kind: "scatter", points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }], meta: { density: 0.2 } },
        ],
      },
    });

  test("set_meta merge-patches any object's meta by id", () => {
    const { api, dispose } = host();
    const result = api.handle({ method: "set_meta", id: "grove", patch: { seed: "abc" } });
    expect(result.ok).toBe(true);
    const path = api.handle({ method: "list_layers" });
    const grove = (path.result as { document: { paths: { id: string; meta?: Record<string, unknown> }[] } }).document.paths.find((p) => p.id === "grove");
    // Merge, not replace — the pre-existing density survives.
    expect(grove!.meta).toEqual({ density: 0.2, seed: "abc" });
    dispose();
  });

  test("set_meta validates against the kind schema and rejects bad params", () => {
    const { api, dispose } = host();
    const bad = api.handle({ method: "set_meta", id: "grove", patch: { density: 999 } });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("density");
    dispose();
  });

  test("set_path patches width + merges meta", () => {
    const { api, dispose } = host();
    const result = api.handle({ method: "set_path", id: "grove", width: 6, meta: { minSpacing: 2 } });
    expect(result.ok).toBe(true);
    expect((result.result as { width: number; meta: Record<string, unknown> }).width).toBe(6);
    expect((result.result as { meta: Record<string, unknown> }).meta).toEqual({ density: 0.2, minSpacing: 2 });
    dispose();
  });

  test("set_marker merges meta and reports not-found", () => {
    const { api, dispose } = host();
    expect(api.handle({ method: "set_marker", id: "m1", meta: { assetId: "bookcase" } }).ok).toBe(true);
    expect(api.handle({ method: "set_marker", id: "nope", label: "x" }).ok).toBe(false);
    dispose();
  });
});
