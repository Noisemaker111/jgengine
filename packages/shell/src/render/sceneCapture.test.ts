import { describe, expect, test } from "bun:test";
import { createElement } from "react";

import { captureCanvas, registerSceneCapture, requestSceneCapture, requestSceneThumbnail, SceneCaptureBinding } from "./sceneCapture";

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

describe("SceneCaptureBinding's props", () => {
  /**
   * A game that builds the overlay with `createElement` passes its `bind` in the props object. An
   * optional props parameter (`{ bind } = {}`) inferred `Attributes & undefined` for React's
   * overload, so the same call stopped typechecking in 0.38.2; this line is the regression.
   */
  const bound = createElement(SceneCaptureBinding, { bind: () => {} });
  const bare = createElement(SceneCaptureBinding);

  test("createElement takes a bind, and takes none", () => {
    expect(bound).toBeDefined();
    expect(bare).toBeDefined();
  });
});
