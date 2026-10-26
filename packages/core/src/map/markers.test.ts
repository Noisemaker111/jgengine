import { describe, expect, it } from "bun:test";
import { createMarkerSet, createMarkerSource, markerKindStyle, DEFAULT_MARKER_KINDS } from "./markers";

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

  it("preserves optional display heading on native markers", () => {
    const markers = createMarkerSet();
    markers.add({ id: "p1", kind: "player", position: [0, 0, 0], heading: Math.PI / 2 });
    expect(markers.get("p1")!.heading).toBe(Math.PI / 2);
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
    expect(markerKindStyle(undefined).id).toBe("marker");
  });
});

describe("portable marker source", () => {
  it("projects caller-owned records and caches repeated snapshot reads", () => {
    const units = [{ id: "u1", x: 4, z: 8, team: "ally" }];
    let projectCalls = 0;
    const markers = createMarkerSource({
      getSnapshot: () => units,
      project: (unit) => {
        projectCalls += 1;
        return { id: unit.id, position: [unit.x, 0, unit.z], kind: unit.team } as const;
      },
    });

    const first = markers.getSnapshot();
    expect(first).toEqual([{ id: "u1", position: [4, 0, 8], kind: "ally" }]);
    expect(markers.getSnapshot()).toBe(first);
    expect(markers.getServerSnapshot!()).toBe(first);
    expect(projectCalls).toBe(1);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("invalidates a projected snapshot when a mutable external store emits", () => {
    const units = [{ id: "u1", x: 0, z: 0 }];
    let emit = (): void => undefined;
    const markers = createMarkerSource({
      subscribe(listener) {
        emit = listener;
        return () => {
          emit = () => undefined;
        };
      },
      getSnapshot: () => units,
      project: (unit) => ({ id: unit.id, position: [unit.x, 0, unit.z] }),
    });
    const first = markers.getSnapshot();
    let notifications = 0;
    const unsubscribe = markers.subscribe(() => {
      notifications += 1;
    });

    units[0] = { id: "u1", x: 12, z: -3 };
    emit();

    const second = markers.getSnapshot();
    expect(notifications).toBe(1);
    expect(second).not.toBe(first);
    expect(second[0]!.position).toEqual([12, 0, -3]);
    unsubscribe();
  });

  it("supports a distinct deterministic server snapshot", () => {
    const clientUnits = [{ id: "client", x: 1, z: 2 }];
    const serverUnits = [{ id: "server", x: 0, z: 0 }];
    const markers = createMarkerSource({
      getSnapshot: () => clientUnits,
      getServerSnapshot: () => serverUnits,
      project: (unit) => ({ id: unit.id, position: [unit.x, 0, unit.z] }),
    });

    expect(markers.getSnapshot()[0]!.id).toBe("client");
    expect(markers.getServerSnapshot!()[0]!.id).toBe("server");
    expect(markers.getServerSnapshot!()).toBe(markers.getServerSnapshot!());
  });
});
