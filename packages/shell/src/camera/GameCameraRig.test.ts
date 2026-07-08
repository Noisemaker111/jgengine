import { describe, expect, test } from "bun:test";
import type { GameCameraConfig } from "@jgengine/core/game/playableGame";
import { resolveRigKind } from "./GameCameraRig";

describe("resolveRigKind", () => {
  test("defaults to orbit with no config", () => {
    expect(resolveRigKind(undefined)).toBe("orbit");
    expect(resolveRigKind({})).toBe("orbit");
  });

  test("explicit rig always wins", () => {
    const config: GameCameraConfig = { rig: "chase", topDown: {}, perspective: "first" };
    expect(resolveRigKind(config)).toBe("chase");
  });

  test("perspective: first wins over any config block short of explicit rig", () => {
    const config: GameCameraConfig = { perspective: "first", topDown: {} };
    expect(resolveRigKind(config)).toBe("first");
  });

  test("infers rig kind from the sole config block present", () => {
    expect(resolveRigKind({ topDown: {} })).toBe("topDown");
    expect(resolveRigKind({ rts: {} })).toBe("rts");
    expect(resolveRigKind({ shoulder: {} })).toBe("shoulder");
    expect(resolveRigKind({ lockOn: {} })).toBe("lockOn");
    expect(resolveRigKind({ chase: {} })).toBe("chase");
    expect(resolveRigKind({ observer: {} })).toBe("observer");
    expect(resolveRigKind({ sideScroll: {} })).toBe("sideScroll");
    expect(resolveRigKind({ inspection: {} })).toBe("inspection");
  });

  test("resolves block-vs-block ambiguity by fixed precedence order", () => {
    expect(resolveRigKind({ rts: {}, shoulder: {} })).toBe("rts");
    expect(resolveRigKind({ inspection: {}, sideScroll: {} })).toBe("sideScroll");
  });

  test("explicit rig breaks a tie between multiple present blocks", () => {
    const config: GameCameraConfig = { rig: "inspection", rts: {}, chase: {} };
    expect(resolveRigKind(config)).toBe("inspection");
  });
});
