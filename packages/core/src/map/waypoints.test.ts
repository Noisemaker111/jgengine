import { describe, expect, test } from "bun:test";

import { createWaypointStore } from "./waypoints";
import { createMarkerSet } from "./markers";

describe("createWaypointStore", () => {
  test("place records an entry and returns a stable id", () => {
    const store = createWaypointStore();
    const id = store.place([10, -4], { label: "Camp" });
    expect(store.get(id)).toEqual({ id, position: [10, -4], kind: "waypoint", label: "Camp" });
    expect(store.list()).toHaveLength(1);
  });

  test("mirrors waypoints into a shared MarkerSet and removes them again", () => {
    const markers = createMarkerSet(() => 0);
    const store = createWaypointStore({ markers });
    const id = store.place([6, 8], { label: "Cache" });

    const marker = markers.get(id);
    expect(marker).not.toBeNull();
    expect(marker?.kind).toBe("waypoint");
    expect(marker?.position).toEqual([6, 0, 8]); // XZ lifted to XYZ with y=0
    expect(marker?.meta).toEqual({ waypoint: true });

    store.remove(id);
    expect(markers.get(id)).toBeNull();
  });

  test("track drives guidance; clearTrack and remove stop it", () => {
    const store = createWaypointStore();
    // +Z is compass south. yaw 0 faces +Z (forward = (sin0, cos0) = (0,1)), so
    // a waypoint due south with the player facing yaw 0 is dead ahead.
    const id = store.place([0, 10], { track: true });
    expect(store.tracked()?.id).toBe(id);

    const guide = store.guidance([0, 0], 0);
    expect(guide).not.toBeNull();
    expect(guide?.distance).toBeCloseTo(10, 5);
    expect(guide?.relative).toBeCloseTo(0, 5);

    store.clearTrack();
    expect(store.guidance([0, 0], 0)).toBeNull();
  });

  test("guidance relative bearing is ±π when the waypoint is directly behind", () => {
    const store = createWaypointStore();
    store.place([0, -10], { track: true }); // due north (−Z); facing yaw 0 = south
    const guide = store.guidance([0, 0], 0);
    expect(Math.abs(guide!.relative)).toBeCloseTo(Math.PI, 5);
  });

  test("guidance relative bearing is 0 when the waypoint is dead ahead", () => {
    const store = createWaypointStore();
    store.place([0, -10], { track: true }); // due north (−Z)
    const guide = store.guidance([0, 0], Math.PI); // yaw π faces −Z = north
    expect(guide?.relative).toBeCloseTo(0, 5);
  });

  test("track returns false for an unknown id", () => {
    const store = createWaypointStore();
    expect(store.track("nope")).toBe(false);
  });

  test("snapshot/restore round-trips waypoints, the tracked id, and mirrored markers", () => {
    const markers = createMarkerSet(() => 0);
    const store = createWaypointStore({ markers });
    const a = store.place([1, 2], { label: "A", track: true });
    store.place([3, 4], { kind: "objective" });

    const snap = JSON.parse(JSON.stringify(store.snapshot()));

    const markers2 = createMarkerSet(() => 0);
    const restored = createWaypointStore({ markers: markers2 });
    restored.restore(snap);

    expect(restored.list()).toHaveLength(2);
    expect(restored.tracked()?.id).toBe(a);
    expect(markers2.get(a)?.kind).toBe("waypoint");
    expect(markers2.list()).toHaveLength(2);
  });

  test("restore drops a tracked id that no longer exists", () => {
    const store = createWaypointStore();
    store.restore({ waypoints: [{ id: "w1", position: [0, 0], kind: "waypoint" }], tracked: "ghost" });
    expect(store.tracked()).toBeNull();
  });

  test("subscribe fires on place, track, remove, and clear", () => {
    const store = createWaypointStore();
    let hits = 0;
    const off = store.subscribe(() => { hits += 1; });
    const id = store.place([0, 0]);
    store.track(id);
    store.remove(id);
    store.clear();
    off();
    store.place([1, 1]);
    expect(hits).toBe(4);
  });
});
