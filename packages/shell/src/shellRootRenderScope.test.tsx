import { afterAll, beforeAll, expect, test } from "bun:test";
import { act, createRoot } from "@react-three/fiber";
import { createElement, Fragment, useSyncExternalStore } from "react";
import * as THREE from "three";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { setTouchControlsMode } from "@jgengine/core/input/touchControlsMode";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { useShellRootResubscribe } from "./GamePlayerShell";

/**
 * The shell root must re-render for the ctx slices it reads — the possessed entity and the touch
 * control mode — and for nothing else. Subscribing it to the raw ctx version made every per-frame
 * pose write reconcile the canvas, the actor tree and the HUD: Scrap Signal ran 11 fps at 621 draws
 * and 60 fps with the same draws once the shell stopped re-rendering (A2.1). The second probe below
 * is the old subscription, so a harness that cannot see re-renders fails this test rather than
 * passing it.
 */

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined;
});

function fixture(): GameContext {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Shell render scope", multiplayer: "off", persist: false }),
    content: { entityById: () => ({ stats: { health: { max: 10 } } }) },
    player: { userId: "account", isNew: true },
  });
  ctx.scene.entity.spawn("Account body", { id: "account", position: [0, 0, 0] });
  ctx.scene.entity.spawn("Pawn", { id: "pawn", position: [0, 0, 0] });
  ctx.player.possession.own("account", "pawn");
  return ctx;
}

interface Harness {
  shellRenders(): number;
  rawVersionRenders(): number;
  write(run: () => void): Promise<void>;
  retire(): Promise<void>;
}

async function mount(ctx: GameContext): Promise<Harness> {
  const renderer = {
    getPixelRatio: () => 1,
    getSize: (target: THREE.Vector2) => target.set(800, 450),
    render() {},
    setSize() {},
    setPixelRatio() {},
    getContext: () => ({}),
  } as unknown as THREE.WebGLRenderer;
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({
    frameloop: "never",
    camera: new THREE.PerspectiveCamera(55, 800 / 450, 0.1, 1000),
    size: { width: 800, height: 450, top: 0, left: 0 },
    dpr: 1,
    gl: () => renderer,
  });

  let shellRenders = 0;
  let rawVersionRenders = 0;
  function ShellProbe() {
    useShellRootResubscribe(ctx, "account");
    shellRenders += 1;
    return null;
  }
  function RawVersionProbe() {
    useSyncExternalStore(ctx.subscribe, ctx.version, ctx.version);
    rawVersionRenders += 1;
    return null;
  }

  await act(async () => {
    root.render(createElement(Fragment, null, createElement(ShellProbe), createElement(RawVersionProbe)));
  });

  return {
    shellRenders: () => shellRenders,
    rawVersionRenders: () => rawVersionRenders,
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

test("a per-frame pose write re-renders the raw-version probe but not the shell root", async () => {
  const ctx = fixture();
  const harness = await mount(ctx);
  try {
    const shellBefore = harness.shellRenders();
    const rawBefore = harness.rawVersionRenders();
    const versionBefore = ctx.version();

    await harness.write(() => ctx.scene.entity.setPose("pawn", { position: [4, 0, 0] }));

    expect(ctx.version(), "a pose write must still notify ctx subscribers").toBeGreaterThan(versionBefore);
    expect(harness.rawVersionRenders(), "the raw-version probe did not re-render, so this harness is blind").toBeGreaterThan(rawBefore);
    expect(harness.shellRenders(), "the shell root re-rendered for a pose write").toBe(shellBefore);
  } finally {
    await harness.retire();
  }
});

test("spawning an entity re-renders neither the shell root nor a possession change is ignored", async () => {
  const ctx = fixture();
  const harness = await mount(ctx);
  try {
    const shellBefore = harness.shellRenders();

    await harness.write(() => ctx.scene.entity.spawn("Crate", { id: "crate", position: [1, 0, 0] }));
    expect(harness.shellRenders(), "the shell root re-rendered when an entity spawned").toBe(shellBefore);

    await harness.write(() => ctx.player.possession.possess("account", "pawn"));
    expect(harness.shellRenders(), "the shell root did not re-render when the possessed entity changed").toBeGreaterThan(shellBefore);
  } finally {
    await harness.retire();
  }
});

test("changing the touch control mode re-renders the shell root", async () => {
  const ctx = fixture();
  const harness = await mount(ctx);
  try {
    const shellBefore = harness.shellRenders();
    await harness.write(() => setTouchControlsMode(ctx, "car"));
    expect(harness.shellRenders(), "the shell root did not re-render when the touch control mode changed").toBeGreaterThan(shellBefore);
  } finally {
    await harness.retire();
  }
});
