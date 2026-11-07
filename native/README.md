# Native Rust experiment (360 fps)

Can a jgengine game run much faster as a native Rust program than it does in the current engine
(TypeScript + three.js in WebView2), with the picture unchanged? This folder measures that on real
frames from two games, Deepward and Harbor Heat.

Nothing here ships. It is an experiment, and its verdict is below.

## How it measures

1. `bun run perf native export <game>` plays the game's perf walk in Chrome and records exactly what
   three.js drew: every linked program, every draw with its GL state and uniform values, every
   buffer and texture as it changed, the camera path, and three's own pixels at a few frames.
2. **jg-shader** translates three's GLSL to WGSL (naga), keeping std140 layout and GL's sampling rules.
3. **jg-render** replays the recording with wgpu. **jg-replay** compares the replay against
   three's pixels at every recorded readback.
4. **jg-native** runs that replay in one uncapped window (Vulkan, `Immediate` present) with:
   - **jg-hud**: Deepward's HUD drawn with Rune;
   - **jg-v8**: Deepward's real TypeScript tick, running in embedded V8;
   - **jg-rules**: Deepward's tick ported to Rust.
5. **jg-web** is the same replay built for wasm32 and drawn with WebGPU in Chrome.

Rows, on one PC (RTX 3070), same scene, camera path and resolution (1920x1080), uncapped:

| Row | What runs |
| --- | --- |
| A | Current engine: the game's diagnostic desktop build (WebView2), `--uncapped` |
| B | Rust native renderer + the real TS rules in V8 + Rune HUD |
| C | Rust native renderer + Rust rules + Rune HUD |
| D | wasm + WebGPU in headless Chrome on the uncapped clock (a normal tab is held to the display's refresh rate) |

Harbor Heat has no native port of its rules or HUD. Its rows B and D are the renderer alone, and
it has no row C.

Reproduce (Windows, from the repo root; `cargo build --release` in `native/` first):

```
bun run jgengine desktop games/<game> --diagnostics      # the row A build
bun run perf native export <game>                        # record the scene
bun run perf native <game> --reuse --desktop <app.exe>   # rows A-D, image diff, table
```

## Results

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

## Verdict

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

## What differs from three, and why

`jg-replay` compares the native frame with three's own pixels at every frame three read back
(Deepward 14 frames, Harbor Heat 13). Every difference found is listed here with its cause.

**Deepward: matches.** Frames from 236 on are within 3 levels of 255 everywhere (mean 0.17,
PSNR 52.6 dB). The first five compared frames (30–167) differ more (PSNR 33–34 dB) for one reason:
they sample two shadow maps (framebuffers 95 and 96) that the game last drew before the recording
began. three still had that content; the replay starts those targets empty. `jg-replay` flags
these frames and `perf native` reports them separately.

**Harbor Heat: matches except for procedural noise.** Mean difference 2.1–3.2 levels, PSNR
30–34 dB, with 8–15% of pixels more than 8 levels off. Draws, geometry, textures, lights and
shadows match. What still differs is the game's procedural noise (sky clouds, wet patches,
surface breakup). It hashes cell corners with `fract(sin(x) * 43758.5453)` and
`fract(p * 0.1031)`, which scale a last-bit rounding difference by about 10^4–10^5. D3D (ANGLE)
and Vulkan (NVIDIA) compile the same arithmetic with different rounding, so some noise cells take
a different random value. The evidence:

- The first version came out blocky. NVIDIA's compiler folded a corner's `+ vec2(1.0, 0.0)` into
  the hash, so two cells sharing a corner hashed it differently. `jg-shader` now adds such corners
  in integers, which gives the same value GL computes and can't be folded. That cut frame 120's
  mean difference from 3.46 to 2.43 and frame 339's from 6.40 to 3.15.
- Changing only how the remaining corner is computed (the same value, written another way) moves
  the difference from 2.43 back to 3.06. The residual lives in that last-bit arithmetic, not in
  anything the replay does.
- The same replay in Chrome's WebGPU, which runs on D3D12 like three's WebGL runs on D3D11, comes
  out closer: mean 0.14 levels and PSNR at least 37.7 dB on every compared frame, against 30.4 dB
  natively on Vulkan. Same shaders, same draws, a different compiler.
- The GPU work is the same either way (same shaders, same draws), so the timing comparison is
  unaffected.

**Replay rules that follow what three and Chrome really drew:**

- BatchedMesh items are drawn one at a time. The export hides `WEBGL_multi_draw`, so three falls
  back to one `drawElements` per item, which the recording captures. Without that, Harbor Heat's
  palms were missing.
- Two of Harbor Heat's instanced meshes (recording geometries 62 and 71) draw more instances than their instance buffers hold (17–28 against 16, and 45–60 against 44).
  Chrome draws them anyway (robust buffer access), and the extra instances read zero matrices and
  draw nothing. The replay draws the instances that fit. This is a bug in Harbor Heat, filed with
  the verdict issue.
- Chrome's WebGPU lets a draw bind 8 vertex buffers, and some of three's draws bind 9 or 10
  (3 program and geometry pairs in Deepward, 35 in Harbor Heat). For those draws, the replay interleaves the
  per-vertex attributes into one buffer, and the per-instance ones if needed. It rebuilds the
  buffer whenever one of them changes. `jg-replay --web-limits` runs that path natively, and both
  games' diffs match the default run frame for frame.
- The timed rows play the recorded path in real time. When a row falls more than a recorded frame
  behind, it applies the missed frames' uploads and uniforms without drawing them. Every timed row
  draws faster than the recording's 60 fps, so this happens only after a stall. `jg-replay
  --skip-between` checks it by drawing only the compared frames. Deepward comes out identical on
  every clean frame. Harbor Heat does not, because some of its targets (framebuffers 263 and 264
  among them) carry content from one frame into the next, so a skipped draw changes later frames.
  The image numbers above come from drawing every frame in order.
- Uniform values are replayed as three recorded them, so the native frame shows exactly the
  scene three drew. Rows B and C still run the game rules every tick. For Deepward, the rules'
  output drives the HUD, but the camera follows the recorded path so both sides draw the same frames.

**How the timings differ in scope:**

- Native GPU ms covers the whole frame: the scene, the Rune HUD, and the copy to the window.
  three's GPU timer covers only WebGL's draws, not the DOM HUD or the compositor. The renderer-only
  run below shows the gap.
- Row A is a real WebView2 window with the game's DOM HUD. Rows B and C are a native window.
  Both are uncapped (`Immediate` present native, `--uncapped` desktop).

## Rune gaps

Rune is pinned at `58eeef5f8974299aa5e471de0010123323e3127e` (it takes no pull requests). Each gap
below is worked around in `jg-hud`:

- Corner radii are circular only. The visor rim's CSS radius is elliptical (9vmin / 12vmin), so it
  is drawn with the mean radius.
- No `clip-path`. The frames' cut corners and the docket's torn edge are drawn as shapes.
- No text shadow. The radio line's 1px shadow is a second text drawn offset below it.
- `Renderer::draw_over` (load instead of clear) is crate-private. The HUD draws through
  `draw_range` into the pass the frame already has open.

## What the rules port leaves out

`jg-rules` ports Deepward's movement, collision and route finding, the Fitter's senses and state
machine, and the body meters and dive clock. It does not port fauna (`tickCreatures`), the weapon
runtime, channels, or checkpoints and saves. Row B runs the whole real TS tick, so its rules time
is the complete one.
