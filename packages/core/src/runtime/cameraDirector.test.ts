import { describe, expect, test } from "bun:test";

import { createCameraDirector, nextChaseView } from "./cameraDirector";
import type { CameraDirectorState, CameraRigConfig } from "./cameraDirector";

describe("camera director FOV kicks", () => {
  test("sums kicks until drained, then reads zero", () => {
    const director = createCameraDirector();
    director.kickFov(4);
    director.kickFov(2.5);
    director.kickFov(Number.NaN);
    expect(director.takeFovKick()).toBe(6.5);
    expect(director.takeFovKick()).toBe(0);
  });

  test("carries a view switch through chase tuning", () => {
    const director = createCameraDirector();
    director.setChaseTuning({ distance: 8, view: "hood" });
    director.setChaseTuning({ ...director.chaseTuning(), view: nextChaseView(director.chaseTuning()?.view ?? "chase") });
    expect(director.chaseTuning()).toEqual({ distance: 8, view: "cockpit" });
  });
});

describe("nextChaseView", () => {
  test("cycles chase → hood → cockpit → chase by default", () => {
    expect(nextChaseView("chase")).toBe("hood");
    expect(nextChaseView("hood")).toBe("cockpit");
    expect(nextChaseView("cockpit")).toBe("chase");
  });

  test("restarts a custom cycle from a view outside it", () => {
    expect(nextChaseView("rear", ["chase", "cockpit"])).toBe("chase");
    expect(nextChaseView("chase", [])).toBe("chase");
  });
});

test("rig overrides own their data, notify consumers and reset independently of chase tuning", () => {
  const director = createCameraDirector(); let changes = 0; director.subscribe(() => changes++);
  const config: CameraRigConfig = { chase: { distance: 10, collision: false } };
  director.setRig("chase", config); config.chase!.distance = 99;
  expect(director.rig()).toEqual({ kind: "chase", config: { chase: { distance: 10, collision: false } } });
  director.setChaseTuning({ height: 3 }); director.setRig(null);
  expect(director.rig()).toBeNull(); expect(director.chaseTuning()).toEqual({ height: 3 }); expect(changes).toBe(3);
  director.follow("rider"); director.kickFov(9); director.reset();
  expect(director.snapshot()).toEqual({ rig: null, cinematic: null, chase: null }); expect(director.takeFovKick()).toBe(0);
});

test("camera JSON roundtrip restores rig/follow/tuning atomically and excludes transient FOV impulses", () => {
  const source = createCameraDirector(), target = createCameraDirector();
  source.follow(null); source.setRig("observer", { observer: { bind: { kind: "point", position: { x: 1, y: 2, z: 3 } }, distance: 12 } });
  source.setChaseTuning({ view: "hood", distance: 8 }); source.kickFov(4);
  const saved = JSON.parse(JSON.stringify(source.snapshot())); target.restore(saved);
  expect(target.snapshot()).toEqual(source.snapshot()); expect(target.takeFovKick()).toBe(0);
  saved.rig.config.observer.distance = 99; expect(target.rig()?.config.observer?.distance).toBe(12);
  const before = target.snapshot(); let changes = 0; target.subscribe(() => changes++);
  for (const bad of [null, {}, { ...before, followEntityId: 7 }, { ...before, rig: { kind: "chase" } },
    { ...before, rig: { kind: "unknown", config: {} } }, { ...before, rig: { kind: "chase", config: { chase: { distance: "bad" } } } },
    { ...before, rig: { kind: "orbit", config: { projection: "orthographic" } } },
    { ...before, chase: { distance: null } }, { ...before, cinematic: { keyframes: [{}] } }]) {
    expect(() => target.restore(bad as CameraDirectorState)).toThrow(); expect(target.snapshot()).toEqual(before);
  }
  expect(changes).toBe(0);
});

test("runtime rig config rejects callbacks, nonfinite numbers and invalid fields before replacing policy", () => {
  const director = createCameraDirector(); director.setRig("orbit", { initialDistance: 5 }); const before = director.snapshot();
  for (const bad of [{ onCameraFollow() {} }, { chase: { distance: Infinity } }, { chase: { view: "unknown" } },
    { observer: { bind: { kind: "entity" } } }, { pitchClamp: [1] }, { unexpected: 1 }]) {
    expect(() => director.setRig("chase", bad as CameraRigConfig)).toThrow(); expect(director.snapshot()).toEqual(before);
  }
});

test("documented instant chase responses remain valid in runtime rig overlays and JSON snapshots", () => {
  const source = createCameraDirector(), target = createCameraDirector();
  source.setRig("chase", { chase: { yawResponse: Infinity, fov: { response: Infinity }, distance: 7 } });
  const json = JSON.parse(JSON.stringify(source.snapshot()));
  expect(json).toEqual(source.snapshot()); target.restore(json);
  expect(target.rig()).toEqual(source.rig()); expect(target.rig()?.config.chase?.yawResponse).toBe(Infinity);
  expect(target.rig()?.config.chase?.fov?.response).toBe(Infinity);
});
