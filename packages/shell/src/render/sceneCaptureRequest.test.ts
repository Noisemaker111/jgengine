import { afterEach, describe, expect, test } from "bun:test";

import {
  registerSceneCapture,
  requestSceneCapture,
  requestSceneThumbnail,
} from "./sceneCaptureRequest";

let unbind: (() => void) | undefined;

afterEach(() => {
  unbind?.();
  unbind = undefined;
  registerSceneCapture(null);
});

describe("requestSceneCapture", () => {
  test("a binding that mounts after the request still answers it", async () => {
    const pending = requestSceneCapture({ settleFrames: 0 });
    queueMicrotask(() => {
      unbind = registerSceneCapture(() => "data:image/png;base64,AAAA");
    });
    expect(await pending).toEqual({ ok: true, capture: "data:image/png;base64,AAAA" });
  });

  test("no binding within the deadline is a stated failure, not a wait", async () => {
    expect(await requestSceneCapture({ bindingTimeoutMs: 5, settleFrames: 0 })).toEqual({
      ok: false,
      reason: "no-binding",
    });
  });

  test("a binding that reads nothing reports no-frame", async () => {
    unbind = registerSceneCapture(() => null);
    expect(await requestSceneCapture({ settleFrames: 0, attempts: 2 })).toEqual({
      ok: false,
      reason: "no-frame",
    });
  });

  test("a reader that throws is a failure, not a crash", async () => {
    unbind = registerSceneCapture(() => {
      throw new Error("tainted canvas");
    });
    expect(await requestSceneCapture({ settleFrames: 0, attempts: 1 })).toEqual({
      ok: false,
      reason: "no-frame",
    });
  });

  test("a retired binding is not used again", async () => {
    unbind = registerSceneCapture(() => "data:image/png;base64,AAAA");
    unbind();
    unbind = undefined;
    expect(await requestSceneCapture({ bindingTimeoutMs: 5, settleFrames: 0 })).toEqual({
      ok: false,
      reason: "no-binding",
    });
  });
});

describe("requestSceneThumbnail", () => {
  test("a frame that cannot become an image is a stated failure", async () => {
    unbind = registerSceneCapture(() => "data:image/png;base64,AAAA");
    expect(await requestSceneThumbnail({ settleFrames: 0 })).toEqual({
      ok: false,
      reason: "undecodable",
    });
  });

  test("no binding is reported before any image work", async () => {
    expect(await requestSceneThumbnail({ bindingTimeoutMs: 5, settleFrames: 0 })).toEqual({
      ok: false,
      reason: "no-binding",
    });
  });
});
