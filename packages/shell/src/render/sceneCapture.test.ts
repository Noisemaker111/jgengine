import { describe, expect, test } from "bun:test";

import { captureCanvas, registerSceneCapture, requestSceneCapture, requestSceneThumbnail } from "./sceneCapture";

describe("captureCanvas", () => {
  test("returns a PNG data URL from the backing canvas", () => {
    const gl = { domElement: { toDataURL: () => "data:image/png;base64,AAAA" } };
    expect(captureCanvas(gl)).toBe("data:image/png;base64,AAAA");
  });

  test("returns null when the canvas throws (tainted/no context)", () => {
    const gl = { domElement: { toDataURL: () => { throw new Error("SecurityError"); } } };
    expect(captureCanvas(gl)).toBeNull();
  });

  test("returns null when the result is not a PNG data URL", () => {
    const gl = { domElement: { toDataURL: () => "" } };
    expect(captureCanvas(gl)).toBeNull();
  });

  test("a save thumbnail is requested from the binding's own subpath", async () => {
    expect(typeof requestSceneCapture).toBe("function");
    expect(typeof requestSceneThumbnail).toBe("function");
    const unbind = registerSceneCapture(() => "data:image/png;base64,AAAA");
    expect(await requestSceneCapture({ settleFrames: 0 })).toEqual({ ok: true, capture: "data:image/png;base64,AAAA" });
    unbind();
  });
});
