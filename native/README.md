# Native Rust

What ships from this folder is the engine's Rune UI layer and its WebGPU shader translator:

- `crates/jg-ui` wraps the vendored Rune (`vendor/rune`, see [VENDORED.md](vendor/rune/VENDORED.md)) for the
  browser. `bun scripts/build-jg-ui-wasm.ts` rebuilds `wasm/jg-ui/`, the bundle games load.
- `crates/jg-shader` translates three.js GLSL to WGSL with naga; `crates/jg-shader-wasm` builds it into
  the WebGPU backend's `glslToWgsl.wasm` (`bun scripts/build-glsl-translator.ts`).

## The native renderer experiment (360 fps)

Could a jgengine game run much faster as a native Rust program than as TypeScript and three.js, with
the picture unchanged? The experiment recorded what three.js drew in Deepward and Harbor Heat,
replayed it with wgpu natively and as wasm with WebGPU in Chrome, and ported Deepward's rules to Rust
and its HUD to Rune. Its verdict was to stay on TypeScript and three.js, so its crates were deleted
(#3220, decision C). Their code is in git history before that change, and #3041 holds the full write-up.

Rows, on one PC (RTX 3070), same scene, camera path and resolution (1920x1080), uncapped:

| Row | What runs |
| --- | --- |
| A | Current engine: the game's diagnostic desktop build (WebView2), `--uncapped` |
| B | Rust native renderer + the real TS rules in V8 + Rune HUD |
| C | Rust native renderer + Rust rules + Rune HUD |
| D | wasm + WebGPU in headless Chrome on the uncapped clock |

Harbor Heat has no native port of its rules or HUD. Its rows B and D are the renderer alone, and
it has no row C.

### Results

Measured 2026-11-07 on this PC (RTX 3070, 1920x1080, uncapped, 8 s of each game's perf walk). Rows A,
B and C ran twice, back to back, and row D once. All times are p50 or p99 milliseconds per frame.

| Game | Row | Run | fps | frame p50 | frame p99 | CPU p50 | GPU p50 |
|---|---|---|---|---|---|---|---|
| Harbor Heat | A: current engine (WebView2) | 1 | 73 | 13.50 | 31.40 | 12.60 | 9.09 |
| Harbor Heat | B: Rust native renderer only | 1 | 182 | 3.54 | 9.16 | 3.17 | 3.26 |
| Harbor Heat | A: current engine (WebView2) | 2 | 75 | 13.20 | 31.30 | 12.30 | 8.96 |
| Harbor Heat | B: Rust native renderer only | 2 | 272 | 3.44 | 6.43 | 2.99 | 3.10 |
| Harbor Heat | D: wasm + WebGPU in Chrome, renderer only | | 283 | 3.30 | 8.70 | 2.90 | n/a |
| Deepward | A: current engine (WebView2) | 1 | 402 | 2.10 | 9.20 | 1.80 | 2.24 |
| Deepward | B: Rust native + TS rules (V8) + Rune HUD | 1 | 280 | 3.42 | 5.71 | 2.14 | 3.23 |
| Deepward | C: Rust native + Rust rules + Rune HUD | 1 | 300 | 3.29 | 4.23 | 1.88 | 3.22 |
| Deepward | A: current engine (WebView2) | 2 | 292 | 3.10 | 7.70 | 2.50 | 2.95 |
| Deepward | B: Rust native + TS rules (V8) + Rune HUD | 2 | 288 | 3.37 | 5.51 | 2.19 | 3.24 |
| Deepward | C: Rust native + Rust rules + Rune HUD | 2 | 294 | 3.35 | 4.33 | 2.22 | 3.24 |
| Deepward | D: wasm + WebGPU in Chrome, renderer only | | 322 | 3.00 | 8.10 | 2.60 | n/a |

A third B/C run on the code that landed matched: Deepward B p50 3.35 / p99 4.60, C 3.36 / 5.23;
Harbor Heat B 3.36 / 6.88, with identical image numbers.

Deepward's native renderer without the HUD: 328 fps, p50 2.87, p99 5.28, CPU 1.66, GPU 2.76. With the
HUD and no rules: p50 3.30, GPU 3.24. The HUD costs about 0.5 ms of GPU.

Image against three's own pixels (every frame three read back):

| Game | Native (rows B, C) | Chrome WebGPU (row D) |
|---|---|---|
| Harbor Heat | mean 2.55/255, PSNR at least 30.4 dB | mean 0.14/255, PSNR at least 37.7 dB |
| Deepward | mean 0.18/255, PSNR at least 52.6 dB on clean frames; 33.3 dB on the 5 frames that sample targets drawn before the recording | mean 0.20/255, PSNR at least 33.6 dB, all frames together |

Notes:

- fps is frames over the whole run. p50 is the typical frame, so a few slow frames pull fps below 1000/p50.
- Row A's CPU is the engine's whole frame (rules, culling, three.js). Its own breakdown puts Harbor
  Heat's game rules at 0.56 ms (`sim:onTick` 0.34, `sim:other` 0.22) and three's main render pass at
  7.3 ms of CPU and 6.4 ms of GPU.
- Row D's GPU column is empty because Chrome resolved only the first 8 of each run's timestamp
  readbacks; the other frames' slots stayed in flight until the run ended (`rows/D.json`, `gpuCounts`).
- Row D plays the path once untimed first, as row A's warmup does, so Chrome's pipeline compiles
  (seconds each for Harbor Heat's largest shaders) happen before the clock starts.

### Verdict

**Stay on TS/three.js for now; don't move the engine to native Rust.** The gate was: row B's frame
p50 at most half of row A's, with a better p99 and a matching image, on both games. Harbor Heat
passes, Deepward does not, and row C (Rust rules) does not pass on Deepward either. Under the gate,
that means staying on TS/three.js.

- **Harbor Heat passes, renderer only.** Frame p50 drops from 13.2–13.5 ms to 3.4–3.5 ms, and p99
  from 31 ms to 6–9 ms. Row A spends 12.3–12.6 ms of CPU and 9 ms of GPU a frame on about 420 draws.
  The replay issues the same draws in 3 ms of CPU and 3.1–3.3 ms of GPU. Its rules aren't ported,
  but row A's breakdown puts them at 0.56 ms, so adding them would not change the pass. The picture
  matches except for the procedural noise residual explained below.
- **Deepward fails.** Row A is already at 2.1–3.1 ms p50 (290–400 fps), and both engines wait on the
  GPU. The native frame's GPU time is 3.2 ms, including the Rune HUD (about 0.5 ms) and the copy to
  the window. The renderer alone takes 2.8 ms, about the same as three's 2.2–3.0 ms. A faster CPU
  side can't speed up a GPU-bound frame. Native does cut the p99: 4.2–5.7 ms against 7.7–9.2 ms.
- **The rules aren't where the time goes.** Deepward's real TS tick takes 0.19 ms in V8, against
  0.002 ms in Rust. Either is tiny next to a frame, so rows B and C come out within noise of each
  other. Nothing here argues for porting rules to Rust ("Rust hot systems").
- **The win isn't native-only.** Row D runs the same replay as wasm and WebGPU inside Chrome and lands
  within a few tenths of a millisecond of native in both games: Harbor Heat at 3.3 ms p50 against
  row A's 13.2. Harbor Heat's 4x comes from how its frame reaches the GPU (three.js through WebGL),
  not from leaving the browser.

What would move both games toward 360 fps (2.8 ms) without changing the picture:

1. **Close the WebGL gap in draw-heavy scenes.** Harbor Heat's main pass costs 7.3 ms of CPU and
   6.4 ms of GPU in three.js on WebGL. The same draws take about 3 ms each way through WebGPU. Next,
   measure the engine's own draws on a WebGPU backend (three's WebGPURenderer, or a lean one for the
   engine's draws). WebView2 and Chrome both ship WebGPU, so the gain reaches desktop and web builds
   alike.
2. **For GPU-bound scenes like Deepward, the passes three already draws set the floor**, the same in
   every engine tried. Profile those passes (shadow maps, post) for cheaper ways to draw the same image.
3. **Keep native Rust as a later option** for when a game needs more than WebGPU gives. This experiment
   found no case where native beat WebGPU in the browser by enough to justify a second engine.

## JSX UI host

The games' JSX uses `@jgengine/core/ui/jsx`. The browser host in
`packages/core/src/ui/rune/` maps the undisplayed UI's resolved CSS to `jg-ui`
boxes; Rune lays out and paints the resulting tree. Its committed browser bundle
is rebuilt with `bun scripts/build-jg-ui-wasm.ts` after native changes.

Embedded canvases use Rune's image paint order, so controls and labels can overlap
previews. The host supplies an initial canvas snapshot, then forwards changed
captured frames to dedicated GPU image textures. It does not read pixels back to
JavaScript or poll static canvases. A removed source stops its capture tracks and
releases its native image. `bun run drive harbor-heat --flow canvas-order --param
ui=rune` checks overlap, an initially static image, idle frames and remounting.
