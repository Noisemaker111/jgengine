import { describe, expect, it } from "bun:test";
import { createMarkerSet, markerKindStyle, DEFAULT_MARKER_KINDS } from "./markers";

describe("marker set", () => {
  it("adds, gets, and removes markers", () => {
    const markers = createMarkerSet(() => 100);
    const id = markers.add({ kind: "objective", position: [4, 0, 2], label: "Vault" });
    const marker = markers.get(id);
    expect(marker).not.toBeNull();
    expect(marker!.kind).toBe("objective");
    expect(marker!.createdAt).toBe(100);
    expect(markers.list()).toHaveLength(1);
    expect(markers.remove(id)).toBe(true);
    expect(markers.get(id)).toBeNull();
    expect(markers.list()).toHaveLength(0);
  });

  it("honors explicit ids and overwrites in place", () => {
    const markers = createMarkerSet();
    markers.add({ id: "p1", kind: "ping", position: [0, 0, 0] });
    markers.add({ id: "p1", kind: "ping", position: [5, 0, 5], label: "moved" });
    expect(markers.list()).toHaveLength(1);
    expect(markers.get("p1")!.position).toEqual([5, 0, 5]);
  });

  it("queries by kind, owner, and radius", () => {
    const markers = createMarkerSet();
    markers.add({ kind: "loot", position: [0, 0, 0], owner: "a" });
    markers.add({ kind: "loot", position: [40, 0, 0], owner: "b" });
    markers.add({ kind: "enemy", position: [1, 0, 1], owner: "a" });
    expect(markers.query({ kind: "loot" })).toHaveLength(2);
    expect(markers.query({ owner: "a" })).toHaveLength(2);
    expect(markers.query({ near: [0, 0, 0], radius: 5 })).toHaveLength(2);
    expect(markers.query({ kind: "loot", near: [0, 0, 0], radius: 5 })).toHaveLength(1);
  });

  it("prunes expired markers by timestamp", () => {
    const markers = createMarkerSet(() => 0);
    markers.add({ kind: "ping", position: [0, 0, 0], expiresAt: 50 });
    markers.add({ kind: "ping", position: [0, 0, 0], expiresAt: 200 });
    markers.add({ kind: "objective", position: [0, 0, 0] });
    expect(markers.prune(100)).toBe(1);
    expect(markers.list()).toHaveLength(2);
  });

  it("notifies subscribers on mutation with stable snapshots between changes", () => {
    const markers = createMarkerSet();
    let calls = 0;
    markers.subscribe(() => {
      calls += 1;
    });
    const before = markers.snapshot();
    const id = markers.add({ kind: "ping", position: [0, 0, 0] });
    expect(calls).toBe(1);
    const after = markers.snapshot();
    expect(after).not.toBe(before);
    const stable = markers.snapshot();
    expect(markers.snapshot()).toBe(stable);
    markers.remove(id);
    expect(calls).toBe(2);
  });

  it("resolves kind styles with a fallback", () => {
    expect(markerKindStyle("enemy")).toBe(DEFAULT_MARKER_KINDS.enemy!);
    expect(markerKindStyle("unknown-kind").glyph).toBe("•");
  });
});
