import { afterEach, describe, expect, test } from "bun:test";
import { armCaptureReady, setCaptureStatus } from "./captureReady";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalObserver = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
const originalFrame = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
const originalNow = Date.now;

afterEach(() => {
  Date.now = originalNow;
  for (const [key, descriptor] of [["window", originalWindow], ["document", originalDocument], ["MutationObserver", originalObserver], ["requestAnimationFrame", originalFrame]] as const) {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, key);
    else Object.defineProperty(globalThis, key, descriptor);
  }
});

function browser(editorCanvas: boolean) {
  const root = { dataset: {} as Record<string, string> };
  const callbacks: (() => void)[] = [];
  class Observer {
    constructor(private readonly callback: () => void) { callbacks.push(callback); }
    observe() {}
    disconnect() {}
  }
  let present = editorCanvas;
  const doc = {
    documentElement: root,
    querySelector: (selector: string) => {
      if (selector === "[data-jg-editor] canvas") return present ? {} : null;
      if (selector === "canvas, [data-jg-frame-ready]" || selector === "[data-jg-editor], canvas") return {};
      return null;
    },
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  Object.defineProperty(globalThis, "MutationObserver", { configurable: true, value: Observer });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { search: "?capture=1&mode=editor&settle=0" }, innerWidth: 800, innerHeight: 600,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms >= 25_000 ? 20 : ms),
    clearTimeout,
  } });
  Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: (fn: () => void) => queueMicrotask(fn) });
  return { root, mount: () => { present = true; for (const callback of callbacks) callback(); } };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 40));

describe("editor capture readiness", () => {
  test("waits for the editor canvas even when another canvas exists", async () => {
    const page = browser(false);
    const cancel = armCaptureReady("editor");
    expect(page.root.dataset.jgCapture).toBe("preparing");
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    expect(page.root.dataset.jgCapture).toBe("preparing");
    page.mount();
    await flush();
    expect(page.root.dataset.jgCapture).toBe("ready");
    cancel();
  });

  test("reports a missing editor rather than accepting another canvas", async () => {
    const page = browser(false);
    const cancel = armCaptureReady("editor");
    await flush();
    expect(page.root.dataset.jgCapture).toBe("error");
    expect(page.root.dataset.jgCaptureError).toContain("[data-jg-editor] canvas");
    cancel();
  });

  test("does not overwrite an editor error with ready", async () => {
    const page = browser(true);
    const cancel = armCaptureReady("editor");
    setCaptureStatus("error", "editor failed");
    await flush();
    expect(page.root.dataset.jgCapture).toBe("error");
    expect(page.root.dataset.jgCaptureError).toBe("editor failed");
    cancel();
  });

  test("remains preparing while scene work is still loading", async () => {
    const page = browser(true);
    const finish = trackSceneWork("capture test");
    const cancel = armCaptureReady("editor");
    await flush();
    expect(page.root.dataset.jgCapture).toBe("preparing");
    cancel();
    finish();
  });

  test("reports scene work that never finishes", async () => {
    const page = browser(true);
    let clock = 0;
    Date.now = () => { clock += 16_000; return clock; };
    const finish = trackSceneWork("stuck capture test");
    const cancel = armCaptureReady("editor");
    await flush();
    expect(page.root.dataset.jgCapture).toBe("error");
    expect(page.root.dataset.jgCaptureError).toContain("models did not finish loading");
    cancel();
    finish();
  });
});
