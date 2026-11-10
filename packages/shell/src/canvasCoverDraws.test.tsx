import { afterAll, beforeAll, expect, test } from "bun:test";
import { act, createElement, Fragment, useEffect } from "react";
import * as THREE from "three";

import { canvasCover } from "@jgengine/core/ui/canvasCover.view";
import { mountTestDraws } from "@jgengine/core/frame/testEngineHost.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";

import { CanvasCoverFrameloop } from "./drivers/CanvasCoverFrameloop";
import { FrameRateLimiter } from "./drivers/FrameRateLimiter";
import { registerSceneWarmup, type ShaderWarmup } from "@jgengine/core/render/shaderWarmup.draw";

/**
 * A covered canvas must stop drawing: Harbor Heat's pause screen left a paused world, its cascade
 * shadows and two postfx prepasses drawing at ~21 fps behind an overlay nobody could see (A7.3).
 * The shell switches the loop to `never` while a surface holds the cover, so nothing draws and
 * nothing ticks; the scene itself is never touched, so the first frame after the cover lifts is the
 * state the player left. A scrim or side panel holds nothing, so the live scene keeps drawing.
 *
 * These run headless: the test host steps frames itself, and only when the frameloop is "always" —
 * the condition the browser loop runs under.
 */

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined;
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

async function mount(): Promise<Harness> {
  const counts = { draws: 0, ticks: 0 };
  const mounted = await mountTestDraws(
    createElement(Fragment, null, createElement(CanvasCoverFrameloop, { authored: "always" }), createElement(World)),
    { width: 800, height: 450 },
  );
  // The host's stub renderer counts `render` calls into `engine.renders`; mirror them into draws.
  const draws = () => mounted.engine.renders;

  function World() {
    const host = useEngineHost();
    const scene = host.frame.scene;
    useFrameTask(() => {
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

  return {
    draws,
    ticks: () => counts.ticks,
    scene: () => mounted.scene,
    frameloop: () => mounted.engine.state.frameloop,
    // The browser loop only runs frames while the frameloop asks for them; stepping under "never"
    // is what an owner like the frame-rate limiter does, and it must be stopped too.
    pump: async (frames) => {
      for (let index = 0; index < frames; index += 1) {
        if (mounted.engine.state.frameloop !== "always") continue;
        await mounted.advance(1 / 60);
      }
    },
    write: async (run) => {
      await act(async () => {
        run();
      });
    },
    retire: () => mounted.unmount(),
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

test("lifting the cover waits for what the scene gained to compile before drawing again", async () => {
  const harness = await mount();
  let finish = () => {};
  let asked = 0;
  const warmup = {
    prepare: () => {
      asked += 1;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  } as unknown as ShaderWarmup;
  const unregister = registerSceneWarmup(harness.scene(), warmup);
  try {
    await harness.pump(1);
    let release = () => {};
    await harness.write(() => {
      release = canvasCover.hold();
    });
    await harness.write(() => release());
    expect(asked, "the press must ask the warmup to compile the new view").toBe(1);
    expect(harness.frameloop(), "the loop must stay stopped while the new view compiles").toBe("never");
    await harness.pump(2);
    expect(harness.draws(), "nothing may draw (and link mid-frame) before the compile is done").toBe(1);
    await harness.write(() => finish());
    expect(harness.frameloop()).toBe("always");
    await harness.pump(1);
    expect(harness.draws()).toBe(2);
  } finally {
    unregister();
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

test("the frame-rate limiter hands its cap to the host and yields it on unmount", async () => {
  const mounted = await mountTestDraws(createElement(FrameRateLimiter, { fps: 30 }), { width: 800, height: 450 });
  try {
    expect(mounted.engine.fpsLimits.at(-1), "the limiter must hand its cap to the host").toBe(30);

    let release = () => {};
    await act(async () => {
      release = canvasCover.hold();
    });
    await act(async () => release());
    expect(mounted.engine.fpsLimits.at(-1), "the cap must survive a cover cycle").toBe(30);
    expect(mounted.engine.fpsLimits, "the limiter must re-apply after the cover").toContain(0);
  } finally {
    await mounted.unmount();
  }
});
