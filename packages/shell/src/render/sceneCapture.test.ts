import { describe, expect, test } from "bun:test";

import { captureCanvas, createSceneCapture, downloadImage, sceneCaptureFor } from "./sceneCaptureRuntime";

const PNG = "data:image/png;base64,AAAA";

function fixture() {
  const frames: Array<{ run: () => void; cancelled: boolean }> = [];
  const downloads: Array<{ url: string; filename: string }> = [];
  const capture = createSceneCapture({
    requestFrame(run) {
      const frame = { run, cancelled: false };
      frames.push(frame);
      return () => { frame.cancelled = true; };
    },
    download(url, filename) { downloads.push({ url, filename }); },
  });
  return { capture, frames, downloads };
}

function overlayFixture(visibility = "", priority = "") {
  const style = {
    getPropertyValue: () => visibility,
    getPropertyPriority: () => priority,
    setProperty: (_name: string, value: string, nextPriority = "") => { visibility = value; priority = nextPriority; },
    removeProperty: () => { const previous = visibility; visibility = ""; priority = ""; return previous; },
  };
  return { overlay: { style: style as CSSStyleDeclaration }, visibility: () => visibility, priority: () => priority };
}

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

  test("rejects empty PNG payloads, zero-sized canvases and lost contexts", () => {
    for (const url of ["data:,", "data:image/png", "data:image/png;base64,"]) {
      expect(captureCanvas({ domElement: { toDataURL: () => url } })).toBeNull();
    }
    expect(captureCanvas({ domElement: { width: 0, toDataURL: () => PNG } })).toBeNull();
    expect(captureCanvas({ domElement: { toDataURL: () => PNG }, getContext: () => ({ isContextLost: () => true }) })).toBeNull();
  });
});

describe("scene photographs", () => {
  test("shares only within an instance and keeps photo preferences independent", () => {
    const first = {};
    const second = {};
    expect(sceneCaptureFor(first)).toBe(sceneCaptureFor(first));
    expect(sceneCaptureFor(first)).not.toBe(sceneCaptureFor(second));
    sceneCaptureFor(first).photoMode.enter();
    sceneCaptureFor(first).bind(() => PNG);
    expect(sceneCaptureFor(second).get().ready).toBe(false);
    expect(sceneCaptureFor(second).photoMode.get().active).toBe(false);
  });

  test("not-ready capture reports failure without scheduling or downloading", async () => {
    const { capture, frames, downloads } = fixture();
    expect(await capture.capture()).toMatchObject({ ok: false, reason: "not-ready" });
    expect(capture.get()).toMatchObject({ ready: false, capturing: false });
    expect(frames).toHaveLength(0);
    expect(downloads).toHaveLength(0);
  });

  test("hides the overlay for the rendered read and restores visibility and preferences", async () => {
    const { capture, frames, downloads } = fixture();
    const presentation = overlayFixture("collapse", "important");
    capture.photoMode.restore({ active: true, hideHud: false });
    const preferences = capture.snapshot();
    capture.bind(() => {
      expect(presentation.visibility()).toBe("hidden");
      return PNG;
    });
    const result = capture.capture({ filename: "game.png", overlay: presentation.overlay });
    expect(capture.get()).toMatchObject({ ready: true, capturing: true });
    expect(downloads).toHaveLength(0);
    frames[0]!.run();
    expect(await result).toEqual({ ok: true, dataUrl: PNG });
    expect(downloads).toEqual([{ url: PNG, filename: "game.png" }]);
    expect(presentation.visibility()).toBe("collapse");
    expect(presentation.priority()).toBe("important");
    expect(capture.snapshot()).toEqual(preferences);
    expect(capture.get()).toEqual({ ready: true, capturing: false, error: null });
  });

  test("failed reads restore the overlay, report failure and allow a later shot", async () => {
    const { capture, frames, downloads } = fixture();
    const presentation = overlayFixture();
    let read: () => string | null = () => null;
    capture.bind(() => read());
    for (read of [() => null, () => { throw new Error("context lost"); }, () => "data:image/png;base64,"]) {
      const result = capture.capture({ overlay: presentation.overlay });
      frames[frames.length - 1]!.run();
      expect(await result).toMatchObject({ ok: false, reason: "capture-failed" });
      expect(presentation.visibility()).toBe("");
      expect(capture.get().capturing).toBe(false);
    }
    expect(downloads).toHaveLength(0);
    read = () => PNG;
    const retry = capture.capture();
    frames[frames.length - 1]!.run();
    expect(await retry).toMatchObject({ ok: true });
  });

  test("download failure restores presentation and clears busy state", async () => {
    let frame = () => {};
    const capture = createSceneCapture({
      requestFrame(run) { frame = run; return () => {}; },
      download() { throw new Error("download refused"); },
    });
    const presentation = overlayFixture("visible");
    capture.bind(() => PNG);
    const result = capture.capture({ overlay: presentation.overlay });
    frame();
    expect(await result).toEqual({ ok: false, reason: "download-failed", message: "download refused" });
    expect(presentation.visibility()).toBe("visible");
    expect(capture.get()).toEqual({ ready: true, capturing: false, error: "download refused" });
  });

  test("an overlapping request cannot schedule a second shot or change presentation", async () => {
    const { capture, frames, downloads } = fixture();
    capture.bind(() => PNG);
    const first = capture.capture();
    expect(await capture.capture()).toMatchObject({ ok: false, reason: "busy" });
    expect(frames).toHaveLength(1);
    frames[0]!.run();
    expect(await first).toMatchObject({ ok: true });
    expect(downloads).toHaveLength(1);
  });

  test("unmount cancels the pending frame and an independent remount can capture", async () => {
    const { capture, frames, downloads } = fixture();
    const presentation = overlayFixture();
    const unbind = capture.bind(() => PNG);
    const result = capture.capture({ overlay: presentation.overlay });
    unbind();
    expect(await result).toMatchObject({ ok: false, reason: "unmounted" });
    expect(frames[0]!.cancelled).toBe(true);
    expect(presentation.visibility()).toBe("");
    expect(capture.get().ready).toBe(false);
    frames[0]!.run();
    expect(downloads).toHaveLength(0);
    capture.bind(() => PNG);
    const remounted = capture.capture();
    unbind();
    expect(capture.get().ready).toBe(true);
    frames[1]!.run();
    expect(await remounted).toMatchObject({ ok: true });
  });

  test("replacement cancels the old shot and stale cleanup cannot detach the new renderer", async () => {
    const { capture, frames, downloads } = fixture();
    const staleCleanup = capture.bind(() => { throw new Error("stale renderer read"); });
    const oldShot = capture.capture();
    capture.bind(() => PNG);
    expect(await oldShot).toMatchObject({ ok: false, reason: "unmounted" });
    staleCleanup();
    frames[0]!.run();
    expect(downloads).toHaveLength(0);
    const currentShot = capture.capture();
    frames[1]!.run();
    expect(await currentShot).toMatchObject({ ok: true });
    expect(downloads).toHaveLength(1);
  });

  test("unmount during a read prevents the returned pixels from being downloaded", async () => {
    const { capture, frames, downloads } = fixture();
    const unbind = capture.bind(() => { unbind(); return PNG; });
    const result = capture.capture();
    frames[0]!.run();
    expect(await result).toMatchObject({ ok: false, reason: "unmounted" });
    expect(downloads).toHaveLength(0);
  });

  test("frame scheduling failure restores presentation without leaving capture busy", async () => {
    const capture = createSceneCapture({ requestFrame() { throw new Error("frame unavailable"); } });
    const presentation = overlayFixture("visible");
    capture.bind(() => PNG);
    expect(await capture.capture({ overlay: presentation.overlay })).toMatchObject({ ok: false, reason: "capture-failed" });
    expect(presentation.visibility()).toBe("visible");
    expect(capture.get().capturing).toBe(false);
  });
});

test("normal renderer scheduler owns readback and explicit cancel restores the overlay", async () => {
  const { capture, frames, downloads } = fixture();
  let rendered: (() => void) | undefined;
  let cancelled = 0;
  let reads = 0;
  capture.bind(() => { reads += 1; return PNG; }, (take) => { rendered = take; return () => { cancelled += 1; }; });
  const presentation = overlayFixture("visible", "important");
  const first = capture.capture({ overlay: presentation.overlay });
  expect(frames).toHaveLength(0);
  expect(reads).toBe(0);
  expect(presentation.visibility()).toBe("hidden");
  capture.cancel();
  expect(await first).toMatchObject({ ok: false, reason: "unmounted" });
  expect(presentation.visibility()).toBe("visible");
  expect(presentation.priority()).toBe("important");
  rendered!();
  expect(reads).toBe(0);
  expect(downloads).toHaveLength(0);
  const next = capture.capture({ overlay: presentation.overlay });
  rendered!();
  expect(await next).toMatchObject({ ok: true });
  expect(reads).toBe(1);
  expect(downloads).toHaveLength(1);
  expect(cancelled).toBe(2);
});

describe("downloadImage", () => {
  test("clicks an attached download anchor and removes it even when download throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    let attached = false;
    const anchor = {
      href: "", download: "", hidden: false,
      click() {
        expect(attached).toBe(true);
        expect(anchor.href).toBe(PNG);
        expect(anchor.download).toBe("game.png");
        throw new Error("download refused");
      },
      remove() { attached = false; },
    };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => anchor, body: { appendChild: () => { attached = true; } } },
    });
    try {
      expect(() => downloadImage(PNG, "game.png")).toThrow("download refused");
      expect(attached).toBe(false);
    } finally {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, "document");
      else Object.defineProperty(globalThis, "document", descriptor);
    }
  });
});
