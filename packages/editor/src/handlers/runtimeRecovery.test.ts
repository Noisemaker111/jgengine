import { describe, expect, test } from "bun:test";
import { createEditorHost } from "../session";
import type { RuntimeStateSnapshot } from "@jgengine/core/editor/liveSync";

describe("runtime reconnect recovery", () => {
  test("an evicted cursor receives a replacing snapshot including removals", () => {
    const { api, dispose } = createEditorHost({ gameId: "recovery", layers: undefined });
    try {
      api.handle({ method: "push_runtime_delta", entities: [{ id: "removed", values: { hp: 10 } }] });
      api.handle({ method: "push_runtime_delta", removeIds: ["removed"] });
      for (let i = 0; i < 130; i++) api.handle({ method: "push_runtime_delta", entities: [{ id: "retained", values: { tick: i } }] });
      const response = api.handle({ method: "pull_runtime_deltas", sinceSeq: 1 });
      expect(response.ok).toBe(true);
      const result = response.result as { seq: number; deltas: unknown[]; snapshot: RuntimeStateSnapshot };
      expect(result.seq).toBe(132);
      expect(result.deltas).toEqual([]);
      expect(result.snapshot.seq).toBe(result.seq);
      expect(result.snapshot.entities.removed).toBeUndefined();
      expect(result.snapshot.entities.retained?.values?.tick).toBe(129);
      const incremental = api.handle({ method: "pull_runtime_deltas", sinceSeq: 131 });
      const next = incremental.result as { deltas: unknown[]; snapshot?: RuntimeStateSnapshot };
      expect(next.deltas).toHaveLength(1);
      expect(next.snapshot).toBeUndefined();
      expect(api.getSession().getState().document.markers).toEqual([]);
    } finally { dispose(); }
  });

  test("an explicit snapshot remains available without a history gap", () => {
    const { api, dispose } = createEditorHost({ gameId: "recovery", layers: undefined });
    try {
      const response = api.handle({ method: "pull_runtime_deltas", sinceSeq: 0, includeSnapshot: true });
      expect(response.ok).toBe(true);
      expect((response.result as { snapshot: RuntimeStateSnapshot }).snapshot.seq).toBe(0);
    } finally { dispose(); }
  });
});
