---
name: jgengine-verify
description: How to verify a JGengine change or game build without burning time on the browser. Invoke when about to "check it works", "verify the scene/world/HUD", "screenshot the game", "make sure it renders", or when a `bun run shoot` / Playwright / Chromium screenshot is hanging, crashing the GPU, or producing corrupt output. The rule this skill exists to enforce: scene correctness is a property of *data* (the environment() descriptor + core world-gen), so it is asserted deterministically in `bun test` — the screenshot is a final human glance, never the verification loop.
---

# JGengine — Verify without the browser

A JGengine scene is derived deterministically from an `environment()` descriptor by pure `@jgengine/core` world-gen. That means "does the world render correctly" is a question about **data**, not pixels — and data is asserted in `bun test` in milliseconds, with no GPU. The browser screenshot only uniquely proves *look* (shader, material, color, framing), and it is the flakiest, slowest step in the repo. So verification runs in this order, and stops as soon as the cheap gates catch the bug.

## The ladder — cheapest first, browser last

1. **`bun run check-types`** — the change compiles across the affected packages. Type-green says nothing about whether the scene has content; it is necessary, not sufficient.
2. **`bun test packages`** — pure game math (curves, cooldowns, spawn logic) and world content. This is where scene correctness is proven:
   - For any game with an `environment()` world, a co-located `<game>.world.test.ts` calls `summarizeEnvironment(world)` (`@jgengine/core/world/environmentSummary`) and asserts the counts. `summarizeEnvironment` resolves the descriptor through the same core world-gen the renderer runs — building counts + part geometry + union bounds, terrain height stats (`min`/`max`/`mean`/`finite`), and water/vegetation/weather presence — plus an `isEmpty` flag.
   - This catches the entire "the game looks broken" class deterministically: empty scene (`isEmpty`), wrong building count, dropped feature, flat or `NaN` terrain (`height.finite === false`, or `max === min` when relief was expected).
3. **`bun run shoot <game> --mode ui`** (HUD) / **`--mode play`** (full scene) — **only** for what the tests above cannot assert: the *look*. This is a final human glance you take once and open the PNG to judge (per `jgengine-ui`). It is not the loop you iterate against.

## The screenshot rules — this is the friction this skill exists to kill

- **The world test is the gate; the screenshot is the glance.** If step 2 is red, fix that first — a screenshot of a broken scene tells you less than a failing assertion, and takes 100× longer to produce.
- **Once `shoot` hangs, do not re-run it in the foreground.** Chromium/Playwright launch on heavy WebGL scenes hangs, crashes the GPU/tab, or emits corrupt output. Re-running the identical command is the rake this repo steps on repeatedly. If a shot hangs once: report it, fall back to the world test to prove the scene resolved, and only retry the screenshot if the user asks.
- **Don't invent in-browser verification the user didn't ask for.** If you've been told not to open the browser, `summarizeEnvironment` + git archaeology is how you confirm behavior — not a screenshot.

## Adding the scene gate to a game

A game with a declared world exports its `environment()` feature and asserts on it:

```ts
// <game>/src/world.world.test.ts
import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "./world"; // the environment() feature

describe("<game> world", () => {
  const summary = summarizeEnvironment(world);
  test("renders a populated scene", () => expect(summary.isEmpty).toBe(false));
  test("has the expected content", () => {
    expect(summary.counts.buildings).toBe(6);
    expect(summary.terrain?.height.finite).toBe(true);
  });
});
```

If the game's world is `biomes()` / `voxel()` / `flat()` rather than `environment()`, `summarizeEnvironment` does not apply — assert on that world's own generator output (region field, voxel seed) with the same "resolve the data, assert the counts" pattern, still browserless.

For a voxel game built on `@jgengine/core/world/voxelField`'s `createVoxelField`, assert on `field.summary()` (`{ blocks, types, bounds }`) the same way an `environment()` world asserts on `summarizeEnvironment`:

```ts
// <game>/src/world.world.test.ts
import { describe, expect, test } from "bun:test";
import { world } from "./world"; // the populated VoxelField

describe("<game> voxel world", () => {
  const summary = world.summary();
  test("renders a populated scene", () => expect(summary.blocks).toBeGreaterThan(0));
  test("has the expected block types", () => {
    expect(summary.types).toContain("stone");
    expect(summary.bounds).not.toBeNull();
  });
});
```

## Definition of done references this

The `jgengine-newgame` full-game checklist and the `jgengine-api` definition of done both gate on the world test before the screenshot. This skill is the *how*; those are the *when*.
