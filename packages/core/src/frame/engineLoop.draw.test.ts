import { afterEach, beforeEach, expect, test } from "bun:test";
import * as THREE from "three";

import { childFrameState, createEngineLoop, type EngineDraw } from "./engineLoop.draw";
import { bindFrameSource } from "./frameBoard.draw";

/**
 * The engine loop is the shell's renderer now: these pin the two behaviors the
 * canvas depends on — a positive-priority draw owns rendering (which the
 * post chain and split-screen rely on), and
 * `setFrameloop` can stop and restart the rAF chain (the canvas cover does
 * exactly that on every menu open).
 */

interface FakeRenderer extends THREE.WebGLRenderer {
  renders: number;
}

function fakeRenderer(): FakeRenderer {
  const renderer = {
    renders: 0,
    domElement: {},
    shadowMap: { enabled: false, type: 0, needsUpdate: false },
    info: { render: { calls: 0, triangles: 0 }, programs: [] },
    autoClear: true,
    toneMapping: 0,
    toneMappingExposure: 1,
    outputColorSpace: "",
    setPixelRatio() {},
    setSize() {},
    render() {
      renderer.renders += 1;
    },
    dispose() {},
  };
  return renderer as unknown as FakeRenderer;
}

function fakeCanvas(): HTMLCanvasElement {
  return { clientWidth: 800, clientHeight: 450, width: 800, height: 450 } as unknown as HTMLCanvasElement;
}

let rafQueue: FrameRequestCallback[] = [];
// Put each stubbed global back exactly: absent stays absent. Assigning the saved undefined back left an
// own `window` key holding undefined, and a later file that stubs `window` only when the key is
// missing then ran with no window (#3194).
const STUBBED = ["requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", "window"] as const;
let saved = new Map<string, PropertyDescriptor | undefined>();

beforeEach(() => {
  rafQueue = [];
  saved = new Map(STUBBED.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
  if (globalThis.window === undefined) {
    (globalThis as { window?: unknown }).window = {
      addEventListener() {},
      removeEventListener() {},
      devicePixelRatio: 1,
    };
  }
});

afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, descriptor);
  }
  bindFrameSource(null);
});

/** Run every scheduled frame callback once — what the browser's rAF does. */
function pumpFrames(): void {
  const queued = rafQueue;
  rafQueue = [];
  for (const callback of queued) callback(0);
}

test("a positive-priority draw takes over rendering; removing it hands render back", () => {
  const renderer = fakeRenderer();
  const loop = createEngineLoop({ canvas: fakeCanvas(), renderer });
  const frames: number[] = [];
  const takeover: EngineDraw = {
    priority: 1,
    frame(state) {
      frames.push(state.delta);
      expect(state.renderTakenOver).toBe(true);
    },
  };
  const plain: EngineDraw = {
    frame() {
      frames.push(-1);
    },
  };
  try {
    loop.add(plain);
    loop.add(takeover);
    pumpFrames();
    expect(frames).toEqual([-1, 0]);
    expect(renderer.renders, "the loop must not render while a priority draw owns the frame").toBe(0);

    loop.add({ frame() {} }); // a fresh zero-priority draw still does not render for it
    pumpFrames();
    expect(renderer.renders).toBe(0);
  } finally {
    loop.dispose();
  }
});

test("frameloop never→always restarts the frame chain after it stopped", () => {
  const renderer = fakeRenderer();
  const loop = createEngineLoop({ canvas: fakeCanvas(), renderer, frameloop: "never" });
  const frames: number[] = [];
  loop.add({ frame: () => frames.push(1) });
  try {
    pumpFrames();
    expect(frames, "never renders nothing on its own").toEqual([]);
    expect(rafQueue, "never schedules no rAF").toEqual([]);

    loop.advance();
    expect(frames).toEqual([1]);
    expect(renderer.renders).toBe(1);

    loop.setFrameloop("always");
    pumpFrames();
    pumpFrames();
    expect(frames.length).toBe(3);
    expect(renderer.renders).toBe(3);

    // The canvas-cover path: always → never → always must keep rendering.
    loop.setFrameloop("never");
    pumpFrames(); // the already-scheduled callback fires once and must not reschedule
    expect(rafQueue).toEqual([]);
    const before = frames.length;
    loop.setFrameloop("always");
    pumpFrames();
    expect(frames.length).toBe(before + 1);
    expect(renderer.renders).toBe(before + 1);
  } finally {
    loop.dispose();
  }
});

test("demand renders only after invalidate, and dispose stops everything", () => {
  const renderer = fakeRenderer();
  const loop = createEngineLoop({ canvas: fakeCanvas(), renderer, frameloop: "demand" });
  let mounted = 0;
  let disposed = 0;
  loop.add({
    mount: () => {
      mounted += 1;
    },
    dispose: () => {
      disposed += 1;
    },
  });
  try {
    expect(mounted).toBe(1);
    pumpFrames();
    expect(renderer.renders, "adding a draw asks for one frame so it appears").toBe(1);
    pumpFrames();
    pumpFrames();
    expect(renderer.renders, "demand renders nothing until asked").toBe(1);

    loop.invalidate();
    pumpFrames();
    expect(renderer.renders).toBe(2);
    pumpFrames();
    expect(renderer.renders, "one invalidate buys one frame").toBe(2);
  } finally {
    loop.dispose();
    expect(disposed).toBe(1);
  }
  pumpFrames();
  expect(renderer.renders).toBe(2);
});

test("a scoped child state is one object per parent and reads each frame's clock live", () => {
  const renderer = fakeRenderer();
  const loop = createEngineLoop({ canvas: fakeCanvas(), renderer, frameloop: "never" });
  const parent = new THREE.Group();
  const child = childFrameState(loop.state, parent);
  expect(childFrameState(loop.state, parent)).toBe(child);
  expect(child.scene).toBe(parent as unknown as THREE.Scene);
  expect(child.rootScene).toBe(loop.scene);
  expect(childFrameState(child, new THREE.Group()).rootScene).toBe(loop.scene);
  loop.advance(2);
  loop.state.elapsed = 2.5;
  expect(child.elapsed).toBe(2.5);
  expect(child.camera).toBe(loop.camera);
  loop.dispose();
});
