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
3. **`bun run shoot <game> --mode ui`** (HUD) / **`--mode play`** (full scene) — **only** for what the tests above cannot assert: the *look*. This is a final human glance you take once and open the PNG to judge (per `jgengine-ui`'s quality bar). It is not the loop you iterate against. The HUD is responsive (`HudCanvas`/`HudPanel` scale, chip, and re-flow on phone-scale displays), so the glance includes a **mobile** shot alongside the desktop one — `bun run shoot <game> --device mobile --mode play` (and `--mode ui` where the HUD is the point) — confirming chips/hides land and nothing overflows a 390px viewport. `--device both` (desktop 1600×900 + mobile 390×844 PNGs) does both in one run; default is desktop. Implementation: system Chrome + raw CDP; page sets `data-jg-capture=ready` (tiny handshake, no PNG/base64 in-page); host `Page.captureScreenshot` writes binary to `shots/`. Optional **`--connect <port>`** attaches to an already-running Chrome with remote debugging, **`--keep`** leaves the dev server and Chrome running for the next call instead of tearing them down, and **`--size half`** halves both dimensions for a cheap mid-loop shot — see "The warm loop" below for the iterative (beautify-work) version of this command. `--mode play` works for pure-DOM/HUD games too (`presentation: "hud"`): the handshake resolves on a `<canvas>` **or** the shape-agnostic `data-jg-frame-ready` marker the shell stamps, so board/card games no longer time out. Use **`--run <cmd[,cmd]>`** to script past a start screen and **`--settle <ms>`** to wait past an intro before capture.

## The screenshot rules — this is the friction this skill exists to kill

- **The world test is the gate; the screenshot is the glance.** If step 2 is red, fix that first — a screenshot of a broken scene tells you less than a failing assertion, and takes 100× longer to produce.
- **Menu-gated games declare `capture.play` once; `--mode play` then just works.** A game with a start/title screen sets `capture: { play: ["<startCommand>"], settleMs?: n }` on its config (the same command its start button dispatches) and marks the menu root element `data-jg-menu`. `shoot --mode play` auto-runs those commands after boot, and the capture **fails loudly** — never a silent menu PNG — if the menu is still on screen at capture time or a declared/`--run` command name isn't registered (the error lists the registered names). `--run <cmd[,cmd]>` remains as a per-shot override; `--settle <ms>` overrides the declared settle. If a shoot errors with "start menu still on screen", the fix is declaring `capture.play` on the game, not retrying with flags.
- **Any other screen is a named capture state.** Sometimes the menu (or lobby, store, results screen) IS the shot. `capture.states` maps a name to the command sequence that reaches that screen from boot — `states: { main_menu: [], store: ["openStore"], game_over: ["startRun", "debug.loseRun"] }` — and `bun run shoot <game> --state <name>` captures it (to `shots/<game>-state-<name>.png`) with **no** live-play guard: a named state captures exactly what it reaches, menus included. Unknown names fail fast listing the declared states. Live-sim states belong here; static UI fixtures stay in `src/preview.tsx` states (faster, no sim).
- **Painted terrain features need mesh resolution.** `terrain.materialRegions` colors interpolate across terrain vertices: at the default segment count a 7-unit road smears into a 40-unit blob. Set `segments` so vertices land every ~2 world units (e.g. 300 for a 640-unit world) before concluding the look is a lighting bug — this exact miss once cost four screenshot loops.
- **First shoot must pass the first-shot art recipe** (`jgengine-world`): `sky` preset `day` when brightness matters (dusk/night ignore `sunIntensity` overrides), a forward (+Z) landmark in frame, readable play-surface colors, props scaled as figures. Fix world/sky/placement *before* the first `shoot` — do not discover murk and bad framing across four screenshot loops.
- **Once `shoot` hangs, do not re-run it in the foreground.** Chrome/CDP on heavy WebGL scenes can hang, crash the GPU/tab, or emit corrupt output. Re-running the identical command is the rake this repo steps on repeatedly. If a shot hangs once: report it, fall back to the world test to prove the scene resolved, and only retry the screenshot if the user asks.
- **Don't invent in-browser verification the user didn't ask for.** If you've been told not to open the browser, `summarizeEnvironment` + git archaeology is how you confirm behavior — not a screenshot.
- **Menu-gated games: `bun run drive`, never hand-rolled Playwright.** A game behind a title/character-select screen (or any state `--mode play` can't reach) is driven with `bun run drive <game> --click "TEXT" --wait 1500 --shot picked --key KeyW:2500 --shot walked` — ordered steps, screenshots to `shots/<game>-<name>.png`. It reuses shoot's dev-server + CDP plumbing; clicks resolve visible text to coordinates, wait for the element's position to stop moving (entrance animations and hydration shift layout for ~2s), and dispatch raw mouse events, so hover overlays never intercept, nothing times out on actionability, and no `--wait` padding is needed before a click; `--key CODE:MS` holds a key (`keydown`/`keyup` with the real `e.code`). Pointer-lock mouse-look can't be synthesized — pick shots that don't need turning, or set the spawn to face the subject.
- **Run `shoot`/`drive` yourself — no subagent needed for screenshots.** A single command writing one PNG isn't a fan-out leg; run it directly and judge the PNG. Route `check-types`/`bun test` through the `fan-out` skill when they're substantial (full gate, full suite).

## The warm loop — cutting shot→judge→edit→re-shoot cost

The ladder above is the correctness gate; once step 2 is green and step 3 starts iterating on *look*, the mechanics of getting there are free to be cheap — the judgment isn't:

1. **Scoped typecheck between edits.** `bun run --cwd Games/<id> check-types` (`tsgo -p Games/<id>/tsconfig.json`, ~5s) proves the edited game compiles; save the full-repo `bun run check-types` gate for the final ship, not every tweak.
2. **Warm dev server + warm Chrome.** The first `shoot`/`drive` call of a loop pays vite's ~60-90s boot; `--keep` leaves that dev server *and* a headless Chrome (fixed debug port 9223, so nothing needs parsing from stdout) running after the process exits instead of tearing both down. Every later re-shot in the same loop passes `--connect 9223` to reuse both — <10s per re-shot, since it skips vite's boot and Chrome's cold launch entirely. HMR carries the edit to the already-open page.
3. **Half-res mid-loop judge shots.** `--size half` halves both dimensions (~1/4 the pixels) on `shoot`/`drive` — plenty to judge composition, palette, and layout each iteration. Drop it (full-res, the default) only for the milestone/PR shot.

```
bun run shoot <id> --mode play --keep                        # first shot: cold boot, stays warm
bun run shoot <id> --mode play --connect 9223 --size half     # every re-shot: <10s, cheap judge PNG
bun run shoot <id> --mode play --connect 9223                 # final shot for the PR: full-res, no --size
```

`drive` takes the same `--keep`/`--connect <port>`/`--size half` flags for menu-gated games. `bun run shoot --help` / `bun run drive --help` print the full flag list.

4. **Read/edit discipline.** Re-reading a whole game file every pass burns tokens for no new information; offset `Read` to the changed region, read-before-edit once, then batch the next edit before re-shooting instead of one edit per read.

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

Every game ships `src/preview.tsx`: the default export is a static default frame, and an optional `states` named export (`GamePreviewStates` from `@jgengine/react/preview`) maps state keys — `stage_1`, `game_over`, `normal_chest:opened` — to components. State components SHOULD compose the game's **real UI components** (`Hud`, `Overlays`, result screens) fed with canned fixture snapshots, not a hand-drawn facsimile: a facsimile only tests the drawing, while real components with fixture state make each key a genuine render test of the UI the player sees.

Capture is `bun run shoot <game> --preview <stateKey>` (bare `--preview` or `--mode preview` = default frame), which drives `/?game=<id>&preview=<stateKey>` in the dev runner. That URL mounts only the resolved preview component — no sim, no three.js, no `GamePlayerShell` — so it renders in milliseconds, never hangs on WebGL, and fires the same `data-jg-capture` handshake. Output lands at `shots/<game>-preview-<state>.png`. An unknown state key fails fast with the list of available keys. Reach for `--preview` before `--mode ui`/`--mode play` whenever the question is "does this UI state render right" — the full-shell modes remain only for live-scene look and integration.

## SSR'd widgets must be hydration-stable

Hosts prerender registry widgets (jgengine.com does this for `/components`), so any widget that emits a computed float straight into an SVG attribute must round at the boundary — server and client stringify a raw trig result to different last digits and React throws a hydration mismatch. Round coordinate output to a fixed precision (≈3 decimals) inside the shared arc/point helper (`polarToCartesian`, `pointAt`, `radial`) so both renders agree; new SVG widgets round by default.

## PR evidence — visual work ships its pixels

Any PR that changes what a player sees (world look, HUD, menus, previews, art direction) embeds its final screenshots in the PR body — the reviewer judges pixels, not prose. Mechanism: push each PNG with **`git`**, never GitHub MCP `create_or_update_file`/`push_files` — those tools take file content as a JSON string, so a binary PNG must be base64-encoded into the request and every byte of that encoding lands in your context as literal tokens (one screenshot easily runs tens of thousands of tokens; a batch of them has hung a session for 20+ minutes). `git` reads bytes straight off disk — nothing but the commands themselves touches context. Do it in a scratch worktree so the task branch's checkout never moves: `git worktree add /tmp/pr-shots-push pr-shots || git worktree add /tmp/pr-shots-push -b pr-shots origin/main` (it's an archive, never merged), copy the PNGs to `/tmp/pr-shots-push/pr-shots/<pr-branch>/<name>.png`, `git -C /tmp/pr-shots-push add -A && git -C /tmp/pr-shots-push commit -m shots && git -C /tmp/pr-shots-push push origin pr-shots`, then `git worktree remove /tmp/pr-shots-push`. Embed each as `![name](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/<pr-branch>/<name>.png)` in the PR body. This is one direct command sequence in the main session — never a subagent, and never one subagent per file (a hung/dropped "upload worker" per screenshot is the exact failure this replaces). Desktop + mobile when the HUD is the point. Non-visual PRs skip this entirely.

## Definition of done references this

The numbered `jgengine` intake defines the observable target; this skill proves it after implementation.
