import { afterAll, beforeAll, expect, test } from "bun:test";
import { act, createRoot, useFrame, useThree } from "@react-three/fiber";
import { createElement, Fragment, useEffect } from "react";
import * as THREE from "three";

import { canvasCover } from "@jgengine/react/canvasCover";

import { CanvasCoverFrameloop } from "./drivers/CanvasCoverFrameloop";
import { FrameRateLimiter } from "./drivers/FrameRateLimiter";

/**
 * A covered canvas must stop drawing: Harbor Heat's pause screen left a paused world, its cascade
 * shadows and two postfx prepasses drawing at ~21 fps behind an overlay nobody could see (A7.3).
 * The shell switches R3F's loop to `never` while a surface holds the cover, so nothing draws and
 * nothing ticks; the scene itself is never touched, so the first frame after the cover lifts is the
 * state the player left. A scrim or side panel holds nothing, so the live scene keeps drawing.
 *
 * These run headless: requestAnimationFrame is stubbed so the test pumps frames itself, and only
 * when the frameloop is "always" — the condition the browser loop runs under.
 */

let originalRaf: typeof globalThis.requestAnimationFrame;
let originalCancel: typeof globalThis.cancelAnimationFrame;

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalRaf = globalThis.requestAnimationFrame;
  originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
});

afterAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined;
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
});

interface Harness {
  draws(): number;
  ticks(): number;
  scene(): THREE.Scene;
  frameloop(): string;
  pump(frames: number): Promise<void>;
  write(run: () => void): Promise<void>;
  retire(): Promise<void>;
}

function fakeRenderer(onDraw: () => void): THREE.WebGLRenderer {
  return {
    getPixelRatio: () => 1,
    getSize: (target: THREE.Vector2) => target.set(800, 450),
    render() {
      onDraw();
    },
    setSize() {},
    setPixelRatio() {},
    getContext: () => ({}),
  } as unknown as THREE.WebGLRenderer;
}

async function mount(): Promise<Harness> {
  const counts = { draws: 0, ticks: 0 };
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({
    frameloop: "always",
    camera: new THREE.PerspectiveCamera(55, 800 / 450, 0.1, 1000),
    size: { width: 800, height: 450, top: 0, left: 0 },
    dpr: 1,
    gl: () => fakeRenderer(() => {
      counts.draws += 1;
    }),
  });

  function World() {
    const scene = useThree((state) => state.scene);
    useFrame(() => {
      counts.ticks += 1;
    });
    useEffect(() => {
      const node = new THREE.Group();
      node.name = "world";
      node.position.set(1, 2, 3);
      scene.add(node);
      return () => {
        scene.remove(node);
      };
    }, [scene]);
    return null;
  }

  let store: ReturnType<typeof root.render> | null = null;
  await act(async () => {
    store = root.render(
      createElement(
        Fragment,
        null,
        createElement(CanvasCoverFrameloop, { authored: "always" }),
        createElement(World),
      ),
    );
  });
  if (store === null) throw new Error("the R3F root did not render");
  const rendered = store;

  return {
    draws: () => counts.draws,
    ticks: () => counts.ticks,
    scene: () => rendered.getState().scene,
    frameloop: () => rendered.getState().frameloop,
    // The browser loop calls update only while the frameloop is "always"; advancing in "never"
    // is what an owner like the frame-rate limiter does, and it must be stopped too.
    pump: async (frames) => {
      for (let index = 0; index < frames; index += 1) {
        if (rendered.getState().frameloop !== "always") continue;
        await act(async () => {
          rendered.getState().advance(performance.now() / 1000, true);
        });
      }
    },
    write: async (run) => {
      await act(async () => {
        run();
      });
    },
    retire: async () => {
      await act(async () => root.unmount());
    },
  };
}

test("a declared cover stops world draws and ticks, and lifting it resumes the same scene", async () => {
  const harness = await mount();
  try {
    await harness.pump(2);
    expect(harness.draws(), "an uncovered canvas draws every frame it is given").toBe(2);
    const scene = harness.scene();
    const world = scene.getObjectByName("world");
    expect(world).toBeDefined();
    const ticksBeforeCover = harness.ticks();

    let release = () => {};
    await harness.write(() => {
      release = canvasCover.hold();
    });
    expect(harness.frameloop(), "a covered canvas must leave the loop stopped").toBe("never");

    await harness.pump(4);
    expect(harness.draws(), "a covered canvas issued world draws").toBe(2);
    expect(harness.ticks(), "a covered canvas kept ticking the world").toBe(ticksBeforeCover);

    await harness.write(() => release());
    expect(harness.frameloop(), "lifting the cover must restore the authored loop").toBe("always");
    await harness.pump(1);
    expect(harness.draws(), "the frame after the cover must draw").toBe(3);
    expect(harness.scene(), "the scene object must survive the cover").toBe(scene);
    expect(harness.scene().getObjectByName("world"), "the world node must survive the cover").toBe(world);
    expect(world?.position.toArray(), "the world must resume where it was").toEqual([1, 2, 3]);
    expect(harness.ticks(), "the loop must tick again after the cover").toBeGreaterThan(ticksBeforeCover);
  } finally {
    await harness.retire();
  }
});

test("an overlay that declares nothing keeps the scene drawing", async () => {
  const harness = await mount();
  try {
    await harness.pump(2);
    expect(harness.draws()).toBe(2);
    expect(canvasCover.covered(), "a scrim or side panel must not declare a cover").toBe(false);
    await harness.pump(2);
    expect(harness.draws(), "a partially visible scene must keep drawing").toBe(4);
  } finally {
    await harness.retire();
  }
});

test("the frame-rate limiter advances nothing while the canvas is covered", async () => {
  const scheduling = { count: 0 };
  globalThis.requestAnimationFrame = () => {
    scheduling.count += 1;
    return scheduling.count;
  };

  const root = createRoot({} as HTMLCanvasElement);
  const rendered = await (async () => {
    await root.configure({
      frameloop: "never",
      camera: new THREE.PerspectiveCamera(55, 800 / 450, 0.1, 1000),
      size: { width: 800, height: 450, top: 0, left: 0 },
      dpr: 1,
      gl: () => fakeRenderer(() => {}),
    });
    let store: ReturnType<typeof root.render> | null = null;
    await act(async () => {
      store = root.render(createElement(FrameRateLimiter, { fps: 30 }));
    });
    if (store === null) throw new Error("the frame-rate limiter did not mount");
    return store;
  })();

  try {
    expect(rendered.getState().frameloop).toBe("never");
    expect(scheduling.count, "the limiter must schedule its own loop while uncovered").toBeGreaterThan(0);

    let release = () => {};
    const schedulingBeforeCover = scheduling.count;
    await act(async () => {
      release = canvasCover.hold();
    });
    expect(scheduling.count, "the limiter kept scheduling frames under a cover").toBe(schedulingBeforeCover);

    await act(async () => release());
    expect(scheduling.count, "the limiter must resume after the cover").toBeGreaterThan(schedulingBeforeCover);
  } finally {
    await act(async () => root.unmount());
    globalThis.requestAnimationFrame = () => 1;
  }
});
