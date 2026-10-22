import { afterEach, describe, expect, test } from "bun:test";

import { resolveCaptureCameraConfig, resolveRigKind, resolveRuntimeCameraConfig, turntableAsObserver } from "./rigResolve";
import { createCameraDirector } from "@jgengine/core/runtime/cameraDirector";
import { installCaptureCamera } from "@jgengine/core/world/captureCamera";
import type { GameCameraConfig } from "@jgengine/core/game/cameraConfig";

describe("resolveRigKind", () => {
  test("infers the turntable rig from its block alone, no explicit rig", () => {
    expect(resolveRigKind({ turntable: { distance: 12 } })).toBe("turntable");
  });

  test("an explicit rig still wins over an inferred block", () => {
    expect(resolveRigKind({ rig: "orbit", turntable: { distance: 12 } })).toBe("orbit");
  });

  test("defaults to orbit, and perspective:first maps to the first rig", () => {
    expect(resolveRigKind(undefined)).toBe("orbit");
    expect(resolveRigKind({})).toBe("orbit");
    expect(resolveRigKind({ perspective: "first" })).toBe("first");
  });
});

describe("turntableAsObserver", () => {
  test("maps a flat target to an observer point bind and carries the orbit fields", () => {
    const mapped = turntableAsObserver({
      turntable: { target: { x: 0, y: 0.5, z: 0 }, distance: 12, height: 7, orbitSpeed: 0.12, fov: 42 },
    });
    expect(mapped.observer?.bind).toEqual({ kind: "point", position: { x: 0, y: 0.5, z: 0 } });
    expect(mapped.observer?.distance).toBe(12);
    expect(mapped.observer?.orbitSpeed).toBe(0.12);
    expect(mapped.observer?.fov).toBe(42);
  });

  test("omits fields that were not set rather than writing undefined", () => {
    const mapped = turntableAsObserver({ turntable: { distance: 9 } });
    expect("bind" in (mapped.observer ?? {})).toBe(false);
    expect("height" in (mapped.observer ?? {})).toBe(false);
    expect(mapped.observer?.distance).toBe(9);
  });
});

test("runtime rig resolution preserves authored camera data/callbacks and null restores the exact configured rig", () => {
  const onCameraFollow = () => undefined, weapon = () => null;
  for (const base of [{ rig: "orbit", initialDistance: 4 }, { rig: "inspection", inspection: { pan: false } }] as const) {
    const configured: GameCameraConfig = { ...base, projection: "orthographic", frustum: { zoom: 80 },
      chase: { height: 3, springDamping: 8 }, onCameraFollow, weapon };
    const director = createCameraDirector(); director.setRig("chase", { chase: { distance: 9 } });
    const resolved = resolveRuntimeCameraConfig(configured, director.rig());
    expect(resolveRigKind(resolved)).toBe("chase"); expect(resolved?.chase).toEqual({ height: 3, springDamping: 8, distance: 9 });
    expect(resolved?.projection).toBe("orthographic"); expect(resolved?.frustum).toBe(configured.frustum);
    expect(resolved?.onCameraFollow).toBe(onCameraFollow); expect(resolved?.weapon).toBe(weapon);
    director.setRig(null); expect(resolveRuntimeCameraConfig(configured, director.rig())).toBe(configured);
    expect(resolveRigKind(configured)).toBe(base.rig); expect(configured.chase).toEqual({ height: 3, springDamping: 8 });
  }
});

describe("resolveCaptureCameraConfig", () => {
  afterEach(() => installCaptureCamera(null));

  const framed = { kind: "observer" as const, config: { perspective: "third" as const, observer: { bind: { kind: "point" as const, position: { x: 1, y: 2, z: 3 } }, distance: 30, height: 20, orbitSpeed: 0 } } };
  const chasing: GameCameraConfig = { rig: "chase", chase: { distance: 7.5, height: 3 } };

  test("nothing installed leaves the game's own rig resolution exactly as it was", () => {
    const director = createCameraDirector();
    director.setRig("chase", { chase: { distance: 9 } });
    expect(resolveCaptureCameraConfig(chasing, director.rig())).toEqual(resolveRuntimeCameraConfig(chasing, director.rig()));
    expect(resolveRigKind(resolveCaptureCameraConfig(chasing, null))).toBe("chase");
  });

  test("an installed capture camera outranks the game's static config and its runtime rig", () => {
    installCaptureCamera(framed);
    const director = createCameraDirector();
    director.setRig("chase", { chase: { distance: 9 } });
    const resolved = resolveCaptureCameraConfig(chasing, director.rig());
    expect(resolveRigKind(resolved)).toBe("observer");
    expect(resolved?.observer?.distance).toBe(30);
    expect(resolved?.observer?.bind).toEqual({ kind: "point", position: { x: 1, y: 2, z: 3 } });
    // A later game-side rig selection still loses: the capture is read after it every frame.
    director.setRig("orbit", { initialDistance: 5 });
    expect(resolveRigKind(resolveCaptureCameraConfig(chasing, director.rig()))).toBe("observer");
  });

  test("clearing the capture camera hands the frame straight back to the game", () => {
    installCaptureCamera(framed);
    const director = createCameraDirector();
    director.setRig("chase", { chase: { distance: 9 } });
    expect(resolveRigKind(resolveCaptureCameraConfig(chasing, director.rig()))).toBe("observer");
    installCaptureCamera(null);
    expect(resolveRigKind(resolveCaptureCameraConfig(chasing, director.rig()))).toBe("chase");
  });
});
