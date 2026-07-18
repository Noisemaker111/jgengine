import { describe, expect, test } from "bun:test";

import { createEditorHost } from "./session";

/** #1106 — schema preset bundles applied through the RPC as one validated meta patch. */
describe("apply_preset RPC", () => {
  const host = () =>
    createEditorHost({
      gameId: "test",
      layers: {
        volumes: [
          {
            id: "district",
            kind: "city",
            shape: "box",
            center: { x: 0, y: 0, z: 0 },
            halfExtents: { x: 200, y: 10, z: 200 },
            meta: { seed: "keepme" },
          },
        ],
      },
    });

  test("applies a named bundle as one meta patch, preserving unlisted keys", () => {
    const { api, dispose } = host();
    const result = api.handle({ method: "apply_preset", id: "district", preset: "ruralohio" });
    expect(result.ok).toBe(true);
    const meta = (result.result as { meta: Record<string, unknown> }).meta;
    expect(meta.gravelLanes).toBe(true);
    expect(meta.fields).toBe(true);
    // The bundle only writes its own keys — the authored seed survives to keep the layout stable.
    expect(meta.seed).toBe("keepme");
    dispose();
  });

  test("rejects unknown presets and unknown targets with honest errors", () => {
    const { api, dispose } = host();
    const unknown = api.handle({ method: "apply_preset", id: "district", preset: "atlantis" });
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("manhattan");
    expect(api.handle({ method: "apply_preset", id: "nope", preset: "manhattan" }).ok).toBe(false);
    dispose();
  });
});

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
