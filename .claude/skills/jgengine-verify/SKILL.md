---
name: jgengine-verify
description: Scene truth is data. Invoke before verifying anything works or renders.
---

# JGengine — Verify without the browser

A JGengine scene is derived deterministically from an `environment()` descriptor by pure `@jgengine/core` world-gen. That means "does the world render correctly" is a question about **data**, not pixels — and data is asserted in `bun test` in milliseconds, with no GPU. The browser screenshot only uniquely proves *look* (shader, material, color, framing), and it is the flakiest, slowest step in the repo. So verification runs in this order, and stops as soon as the cheap gates catch the bug.

## The ladder — cheapest first, browser last

1. **`bun run check-types`** — the change compiles across the affected packages. Type-green says nothing about whether the scene has content; it is necessary, not sufficient.
2. **`bun test packages`** — pure game math (curves, cooldowns, spawn logic) and world content. This is where scene correctness is proven:
   - For any game with an `environment()` world, a co-located `<game>.world.test.ts` calls `summarizeEnvironment(world)` (`@jgengine/core/world/environmentSummary`) and asserts the counts. `summarizeEnvironment` resolves the descriptor through the same core world-gen the renderer runs — building counts + part geometry + union bounds, terrain height stats (`min`/`max`/`mean`/`finite`) plus the resolved terrain `palette` (low/high/waterline), and water/vegetation/weather presence plus each structure group's resolved `style` + `palette` — plus an `isEmpty` flag.
   - This catches the entire "the game looks broken" class deterministically: empty scene (`isEmpty`), wrong building count, dropped feature, flat or `NaN` terrain (`height.finite === false`, or `max === min` when relief was expected), or a game left on the engine's untouched look (`terrain.palette`/`structures[].palette` still matching the default `material: "grass"` / `style: "generic"` instead of this game's own choice) — the identical-worlds bug the `material`/`style` unions exist to prevent.
3. **`bun run shoot <game> --mode ui`** (HUD) / **`--mode play`** (full scene) — **only** for what the tests above cannot assert: the *look*. This is a final human glance you take once and open the PNG to judge (per `jgengine-ui`'s quality bar). It is not the loop you iterate against. The HUD is responsive (`HudCanvas`/`HudPanel` scale, chip, and re-flow on phone-scale displays), so the glance includes a **mobile** shot alongside the desktop one — `bun run shoot <game> --device mobile --mode play` (and `--mode ui` where the HUD is the point) — confirming chips/hides land and nothing overflows a 390px viewport. `--device both` (desktop 1600×900 + mobile 390×844 PNGs) does both in one run; default is desktop. Implementation: system Chrome + raw CDP; page sets `data-jg-capture=ready` (tiny handshake, no PNG/base64 in-page); host `Page.captureScreenshot` writes binary to `shots/`. Optional **`--connect <port>`** attaches to an already-running Chrome with remote debugging.

## The screenshot rules — this is the friction this skill exists to kill

- **The world test is the gate; the screenshot is the glance.** If step 2 is red, fix that first — a screenshot of a broken scene tells you less than a failing assertion, and takes 100× longer to produce.
- **A start/title screen blocks `--mode play`.** If the game gates play behind a menu, the play-mode screenshot shows the menu forever. Ship the gate as one store default the scenario can flip (`game.start` command + `uiScenario` that runs it), and glance the world by flipping that single default — never by restructuring UI for the screenshot.
- **Painted terrain features need mesh resolution.** `terrain.materialRegions` colors interpolate across terrain vertices: at the default segment count a 7-unit road smears into a 40-unit blob. Set `segments` so vertices land every ~2 world units (e.g. 300 for a 640-unit world) before concluding the look is a lighting bug — this exact miss once cost four screenshot loops.
- **First shoot must pass the first-shot art recipe** (`jgengine-world`): `sky` preset `day` when brightness matters (dusk/night ignore `sunIntensity` overrides), a forward (+Z) landmark in frame, readable play-surface colors, props scaled as figures. Fix world/sky/placement *before* the first `shoot` — do not discover murk and bad framing across four screenshot loops.
- **Once `shoot` hangs, do not re-run it in the foreground.** Chrome/CDP on heavy WebGL scenes can hang, crash the GPU/tab, or emit corrupt output. Re-running the identical command is the rake this repo steps on repeatedly. If a shot hangs once: report it, fall back to the world test to prove the scene resolved, and only retry the screenshot if the user asks.
- **Don't invent in-browser verification the user didn't ask for.** If you've been told not to open the browser, `summarizeEnvironment` + git archaeology is how you confirm behavior — not a screenshot.
- **Menu-gated games: `bun run drive`, never hand-rolled Playwright.** A game behind a title/character-select screen (or any state `--mode play` can't reach) is driven with `bun run drive <game> --click "TEXT" --wait 1500 --shot picked --key KeyW:2500 --shot walked` — ordered steps, screenshots to `shots/<game>-<name>.png`. It reuses shoot's dev-server + CDP plumbing; clicks resolve visible text to coordinates and dispatch raw mouse events, so hover overlays never intercept and nothing times out on actionability; `--key CODE:MS` holds a key (`keydown`/`keyup` with the real `e.code`). Pointer-lock mouse-look can't be synthesized — pick shots that don't need turning, or set the spawn to face the subject.
- **Run this ladder via the `fan-out` skill** — never `check-types` / `bun test` / `shoot` / `drive` on the frontier model. You only judge the PNG and failing assertions.

## Adding the scene gate to a game

A game with a declared world exports its `environment()` feature and asserts on it:

```ts
// <game>/src/game/world.world.test.ts — under src/game/, never at the top of src/ (check-game-shape rejects extra files there)
import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { world } from "../world"; // the environment() feature

describe("<game> world", () => {
  const summary = summarizeEnvironment(world);
  test("renders a populated scene", () => expect(summary.isEmpty).toBe(false));
  test("has the expected content", () => {
    expect(summary.counts.buildings).toBe(6);
    expect(summary.terrain?.height.finite).toBe(true);
  });
  test("uses this game's own look, not the engine defaults", () => {
    expect(summary.terrain?.palette.low).not.toBe("#30402c"); // untouched "grass" default
    expect(summary.structures[0]?.palette.wall).not.toBe("#83766a"); // untouched "generic" default
  });
});
```

If the game's world is `biomes()` / `voxel()` / `flat()` rather than `environment()`, `summarizeEnvironment` does not apply — assert on that world's own generator output (region field, voxel seed) with the same "resolve the data, assert the counts" pattern, still browserless.

For a voxel game built on `@jgengine/core/world/voxelField`'s `createVoxelField`, assert on `field.summary()` (`{ blocks, types, bounds }`) the same way an `environment()` world asserts on `summarizeEnvironment`:

```ts
// <game>/src/game/world.world.test.ts — under src/game/, never at the top of src/ (check-game-shape rejects extra files there)
import { describe, expect, test } from "bun:test";
import { world } from "../world"; // the populated VoxelField

describe("<game> voxel world", () => {
  const summary = world.summary();
  test("renders a populated scene", () => expect(summary.blocks).toBeGreaterThan(0));
  test("has the expected block types", () => {
    expect(summary.types).toContain("stone");
    expect(summary.bounds).not.toBeNull();
  });
});
```

## Preview states — the fast, reliable UI capture path

Every game ships `src/preview.tsx`: the default export is a static default frame (the website card), and an optional `states` named export (`GamePreviewStates` from `@jgengine/react/preview`) maps state keys — `stage_1`, `game_over`, `normal_chest:opened` — to components. State components SHOULD compose the game's **real UI components** (`Hud`, `Overlays`, result screens) fed with canned fixture snapshots, not a hand-drawn facsimile: a facsimile only tests the drawing, while real components with fixture state make each key a genuine render test of the UI the player sees.

Capture is `bun run shoot <game> --preview <stateKey>` (bare `--preview` or `--mode preview` = default frame), which drives `/?game=<id>&preview=<stateKey>` in the dev runner. That URL mounts only the resolved preview component — no sim, no three.js, no `GamePlayerShell` — so it renders in milliseconds, never hangs on WebGL, and fires the same `data-jg-capture` handshake. Output lands at `shots/<game>-preview-<state>.png`. An unknown state key fails fast with the list of available keys. Reach for `--preview` before `--mode ui`/`--mode play` whenever the question is "does this UI state render right" — the full-shell modes remain only for live-scene look and integration.

## Definition of done references this

The numbered `jgengine` intake defines the observable target; this skill proves it after implementation.
