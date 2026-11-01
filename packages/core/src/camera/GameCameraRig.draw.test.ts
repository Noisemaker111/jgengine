import { describe, expect, test } from "bun:test";
import type { GameCameraConfig } from "@jgengine/core/game/playableGame";
import { resolveRigKind } from "./rigResolve";
import { createCameraShake } from "@jgengine/core/camera/shake/cameraShake";

import { rigShakeConfig } from "@jgengine/core/camera/shake/cameraShake";

describe("resolveRigKind", () => {
  test("defaults to orbit with no config", () => {
    expect(resolveRigKind(undefined)).toBe("orbit");
    expect(resolveRigKind({})).toBe("orbit");
  });

  test("explicit rig always wins", () => {
    const config: GameCameraConfig = { rig: "chase", rigs: { topDown: {} }, perspective: "first" };
    expect(resolveRigKind(config)).toBe("chase");
  });

  test("perspective: first wins over any config block short of explicit rig", () => {
    const config: GameCameraConfig = { perspective: "first", rigs: { topDown: {} } };
    expect(resolveRigKind(config)).toBe("first");
  });

  test("infers rig kind from the sole config block present", () => {
    expect(resolveRigKind({ rigs: { topDown: {} } })).toBe("topDown");
    expect(resolveRigKind({ rigs: { rts: {} } })).toBe("rts");
    expect(resolveRigKind({ rigs: { shoulder: {} } })).toBe("shoulder");
    expect(resolveRigKind({ rigs: { lockOn: {} } })).toBe("lockOn");
    expect(resolveRigKind({ rigs: { chase: {} } })).toBe("chase");
    expect(resolveRigKind({ rigs: { observer: {} } })).toBe("observer");
    expect(resolveRigKind({ rigs: { sideScroll: {} } })).toBe("sideScroll");
    expect(resolveRigKind({ rigs: { inspection: {} } })).toBe("inspection");
  });

  test("resolves block-vs-block ambiguity by fixed precedence order", () => {
    expect(resolveRigKind({ rigs: { rts: {}, shoulder: {} } })).toBe("rts");
    expect(resolveRigKind({ rigs: { inspection: {}, sideScroll: {} } })).toBe("sideScroll");
  });

  test("explicit rig breaks a tie between multiple present blocks", () => {
    const config: GameCameraConfig = { rig: "inspection", rigs: { rts: {}, chase: {} } };
    expect(resolveRigKind(config)).toBe("inspection");
  });
});

describe("combat shake channel composition", () => {
  test("hit reaction feeds the shared channel instead of writing camera pose", () => {
    const channel = createCameraShake(rigShakeConfig({ decayPerSecond: 4 }));
    expect(channel.trauma()).toBe(0);
    channel.add(0.5);
    expect(channel.trauma()).toBeGreaterThan(0);
    channel.update(0.1);
    const offset = channel.offset();
    expect(Math.abs(offset.x) + Math.abs(offset.y) + Math.abs(offset.roll)).toBeGreaterThan(0);
    // A rig shake kicks position and roll only, so aim never drifts under a hit.
    expect(Math.abs(offset.z)).toBe(0);
    expect(Math.abs(offset.pitch)).toBe(0);
    expect(Math.abs(offset.yaw)).toBe(0);
  });
});
