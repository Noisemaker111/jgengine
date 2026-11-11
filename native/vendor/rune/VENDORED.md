# Vendored Rune

Rune (https://github.com/anomalyco/rune, MIT) is pre-release and takes no pull
requests, so jgengine carries a patched copy here instead of a git pin.

- Upstream: `dev` at `c92e462e9b0acfe6aab191a062bd33b1fcd25823` (2026-11-11).
- Copied: `crates/`, `themes/opencode` (a path dependency of `rune-kit`), the
  workspace `Cargo.toml`, `Cargo.lock` and `LICENSE`; examples, other themes, site and
  tooling are not vendored (workspace members trimmed to the `crates/*` the engine
  builds plus `themes/opencode`; `rune-i18n`, `rune-notify` and `rune-luau` are copied
  but not members).
- Text: upstream's default smoothing is `WindfoilChromium` everywhere but macOS and a
  Mac's browser. The engine takes that look as it is.

Direct Rune tests use this workspace and its `Cargo.lock` for dev dependencies:
`cargo test --manifest-path native/vendor/rune/Cargo.toml -p rune --no-default-features --features embedded-fonts,svg --jobs 4 --target-dir native/target`.
The engine's `jg-ui` build uses the separate `native/Cargo.lock`.

## jgengine patches

Each is still missing upstream at the commit above. When upstream `dev` gains
equivalent support, re-vendor and drop the patch.

`crates/rune/src/runtime/layout_read.rs` — `Runtime::layout_rects` iterates the
current committed layout without allocating inspection records or waiting for
queued layout handlers. The page bridge reports native keyed bounds from it with the
tree revision that built them, so a pointer or drive lookup never reads a previous
tree's rectangle.

`crates/rune/src/el/layout.rs` — `El::layout_style` edits the element's whole
`taffy::Style`. The native builder uses it for `display: none` on hidden nodes and
for fractional heights, which the element builders do not expose.

`crates/rune/src/platform/web.rs` — web transparency. Upstream's web surface
path never applies `WindowOptions.transparent`: wgpu reports the WebGPU canvas
as `alpha_modes: [Opaque]` only, so `get_default_config` always configures an
opaque canvas. The patch reads `app.window_options.transparent`, sets
`rt.transparent` (so `clear_color` returns `[0,0,0,0]`) and forces
`config.alpha_mode = PreMultiplied`, which wgpu maps to
`GpuCanvasAlphaMode::Premultiplied`. Needed for the HUD/menu canvas that
composites over the game's three.js canvas.

`crates/rune/src/platform/web.rs` and `crates/rune/Cargo.toml` — WOFF fonts. `App::font_url`
hands fetched bytes straight to the text stack, which reads TrueType/OpenType only, while the
engine's font library ships WOFF2. The patch decompresses WOFF and WOFF2 (the `wuff` crate)
after the fetch.

`crates/rune/src/runtime/input/pointer.rs` — a scroll viewport with zero range on
the requested axis does not capture wheel/touch targeting, so a nested list that
does not overflow lets its overflowing parent scroll.

`crates/rune/src/platform/web/{bridge.js,input.rs}` — wheel messages carry their
own viewport coordinates and modifiers. The bridge handles the canvas event in
capture and stops Winit's duplicate event; normal scrolling, Shift-horizontal
scrolling and Ctrl-wheel zoom share Rune's wheel APIs.

`crates/rune/src/platform/web/input.rs` — web touch build fix. Upstream's zoom change
(#581) made `window::touch` read the scale from the runtime and take two arguments, but
left the web caller passing three, so `dev` at the commit above does not compile for
wasm32. The patch drops the extra argument; the runtime's scale is the one the web
surface sets on resize.

`crates/rune/src/text/glyph_emit.rs` and `text/macos/smoothing.rs` — synthetic bold
for regular-only game fonts. Upstream draws synthetic bold (`Face::bold`, Skia's
stroke) only for Windows system faces. The patch also marks a run bold when fontique
asks to embolden it, or when it asks for semibold or heavier of a static face lighter
than 600, so a game's regular-only web font draws bold on every platform. Variable
weight axes and real bold faces keep their own outlines. On macOS the outline
dilation stays on for such runs with font smoothing off (the web default).

`crates/rune/src/platform/web/platform.js` — SVG URLs decode through the browser's
image pipeline before upload. Rune's minimal SVG decoder omits text because it has
no font database; browser decoding preserves logo lettering and local system fonts.

## Patches dropped on 2026-11-11

The engine's CSS-to-Rune mirror is gone (the JSX host builds native Rune nodes), so
the patches only it used were not re-applied: image tile patterns, separable blend
modes and `El::isolate`, the uncapped backdrop-blur count, per-span font families,
`calc()` lengths in `rune-taffy`, `El::scroll_axes`, repeated `cutout_circle`,
`input_columns`, browser canvas/video frames (`Pixels::set_browser_frame`) and the
WebGPU `COPY_SRC` canvas usage those blends needed.
