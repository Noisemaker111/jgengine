import { afterEach, describe, expect, test } from "bun:test";

import { clearCaptureCamera, installCaptureCamera, readCaptureCamera } from "./captureCamera";

const FRAMED = {
  kind: "observer" as const,
  config: { observer: { bind: { kind: "point" as const, position: { x: 1, y: 2, z: 3 } }, distance: 30 } },
};

describe("capture camera override", () => {
  afterEach(() => clearCaptureCamera());

  test("no capture camera is installed by default", () => {
    expect(readCaptureCamera()).toBeNull();
  });

  test("install is idempotent and last write wins", () => {
    installCaptureCamera(FRAMED);
    expect(readCaptureCamera()).toBe(FRAMED);
    const second = { kind: "topDown" as const, config: { topDown: { height: 40 } } };
    installCaptureCamera(second);
    expect(readCaptureCamera()).toBe(second);
  });

  test("clearing hands the frame back to the game", () => {
    installCaptureCamera(FRAMED);
    clearCaptureCamera();
    expect(readCaptureCamera()).toBeNull();
    installCaptureCamera(null);
    expect(readCaptureCamera()).toBeNull();
  });
});
