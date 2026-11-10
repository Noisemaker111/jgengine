# Rune paint verification

This batch targets `t3/no-react-ui-on-rune` for integration into #3108. Runtime
changes stay in Rune paint and its computed-style mapper. Game components are
unchanged. Performance is not measured.

## Regression evidence

The new tests were run against the previous implementation or a deliberately
disabled paint path before the fixes were accepted. All mutations were restored.

| Feature | Observed failing assertion |
| --- | --- |
| Gradient masks | Completed child alpha was not modulated once |
| Brightness | Completed subtree RGB did not change while preserving alpha |
| Drop shadow | Shadow missing; an offscreen source also lost its visible shadow |
| Blend modes | CSS alpha compositing differed in nested targets |
| Texture layers | URL layer did not occupy its CSS position in the stack |
| Repeating conic | Parser returned no conic gradient |
| Gradient text | Gradient painted outside glyphs |
| Underlines | Authored thickness or color was lost |
| Parent polygon | Image and text escaped the polygon |
| Backdrop blur | Periodic edge profile differed from the expected Gaussian |

Native regressions live in `native/crates/jg-ui/src/blend_tests.rs`; mapper
regressions live in `packages/core/src/ui/rune/css{Values,Mirror.view}.test.ts`.
The video-copy regression was also made red by rethrowing Chrome's transient
`OperationError`, then restored. It checks recovery and propagation of other errors.

## Saved pixel proof

`paint-effects` mounts twelve isolated elements in the actual Deepward entry.
Capture DOM first, then Rune with the same viewport. Each probe compares its saved
PNG crop against DOM, requiring mean RGB channel error below 5/255. This permits
font smoothing and edge coverage differences; it does not assert identical pixels.
Both screenshots must be inspected. A premature missing-image capture failed
the polygon probe at 47.151/255 and was rejected.

On this Linux host, Chrome uses `--enable-unsafe-webgpu --enable-features=Vulkan
--use-vulkan=swiftshader`; capture uses `JG_CAPTURE_GL=swiftshader`,
`JG_CAPTURE_SCREENCAST=0` and `JG_BROKER=0`. Native decoding can finish after a DOM
image reports complete. The proof settles before comparing its saved pixels.

## Integration tracking

The full gate stopped at `games-sync`: all ten game `jgengine.json` files still
list `react` in `engine`, while their manifests already depend on `@jgengine/ui`.
Running sync would reintroduce the retired dependency. This exists on parent
commit `54bb62aad`; #3108's owner must finish that migration before landing.
This paint batch does not change game configuration or claim a green full gate.

Whole-game layout parity with beta remains #3108's integration work. The isolated
paint comparisons establish this batch's DOM agreement. Premature play-entry HUD
captures are not evidence of HUD fidelity; later city-phone captures show the HUD.
