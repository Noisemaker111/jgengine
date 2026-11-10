# Vendored Rune

Rune (https://github.com/anomalyco/rune, MIT) is pre-release and takes no pull
requests, so jgengine carries a patched copy here instead of a git pin.

- Upstream: `dev` at `d751f07106eac47bdd4e33756dee71e1f593c9e2` (2026-11-09).
- Copied: `crates/`, `themes/opencode` (a path dependency of `rune-kit`), the
  workspace `Cargo.toml` and `LICENSE`; examples, other themes, site and
  tooling are not vendored (workspace members trimmed to `crates/*` plus
  `themes/opencode`).

## jgengine patches

`crates/rune/src/el/{visual,visuals}.rs`, `runtime/{commit/memo_reuse,paint/build,paint/cache_layer}.rs`,
`render{,/layers,/upload}.rs` and `shader.wgsl` — separable subtree blending and
explicit isolation. Multiply, overlay, screen and soft-light copy the current
paint target at their composite position, reuse its pooled backdrop texture, and
apply the CSS sRGB formulas with premultiplied alpha. The existing glyph texture
binding carries that backdrop only for layer composites; the instance ABI stays
unchanged. Nested targets keep their own origin. A borrowed/non-copyable pass
reports `degraded:` and draws source-over. `El::isolate` retains an otherwise
opaque scope so descendants cannot blend with paint outside it. Backdrop-dependent
subtrees cannot retain a stale raster cache. GPU pixel tests cover both encodings,
partial alpha, nested panels, isolation, background polygons and translucent borders.
The web surface explicitly requests `COPY_SRC` on WebGPU: wgpu 30's web backend
reports only `RENDER_ATTACHMENT` even though canvas configuration supports copies.
The real-entry material proof catches this separately from offscreen GPU tests.

`crates/rune/src/runtime/input/pointer.rs` — a scroll viewport with zero range on
the requested axis does not capture wheel/touch targeting. Nested CSS
`overflow:auto` panes let their overflowing parent scroll instead of swallowing
the gesture in the inactive inner viewport.

`crates/rune/src/platform/web/{bridge.js,input.rs}` — wheel messages carry their
own viewport coordinates and modifiers. A host can claim pointer movement for
its semantic UI without leaving Rune's wheel target unset. The bridge handles
the canvas event in capture and stops Winit's duplicate event; normal canvas
scrolling, Shift-horizontal scrolling and Ctrl-wheel zoom share Rune's wheel APIs.

`crates/rune/src/text/{span.rs,hash.rs}` and `text.rs` — per-span font families.
Family overrides participate in span merging, shaping/cache keys, font selection
and paragraph wrapping. The CSS host uses these for mixed display/body text and
monospace values inside long paragraphs, without splitting them into flex rows.

`crates/rune/src/text/glyph_emit.rs` and `text/macos/smoothing.rs` — synthetic
bold for regular-only game fonts. Carry Fontique's embolden flag into glyph
rasterization and outline drawing; the growth radius participates in the glyph
cache key. Synthetic weight remains visible with font smoothing off (the web
default), and DirectWrite delegates synthetic faces to the outline rasterizer.
Requests for semibold also synthesize when the selected static face is lighter;
actual semibold faces and variable weight axes retain their own outlines.

`crates/rune/src/platform/web.rs` — web transparency. Upstream's web surface
path never applies `WindowOptions.transparent`: wgpu reports the WebGPU canvas
as `alpha_modes: [Opaque]` only, so `get_default_config` always configures an
opaque canvas. The patch reads `app.window_options.transparent`, sets
`rt.transparent` (so `clear_color` returns `[0,0,0,0]`) and forces
`config.alpha_mode = PreMultiplied`, which wgpu maps to
`GpuCanvasAlphaMode::Premultiplied`. Needed for the HUD/menu overlay canvas
that composites over the game's three.js canvas.

When upstream `dev` gains equivalent support, re-vendor and drop the patch.

`crates/rune/src/el/{scroll,rare}.rs` and `runtime/commit/{flatten,memo_reuse}.rs` —
`El::scroll_axes` preserves the supplied CSS child layout while scrolling either or
both axes. The convenience horizontal builder unwraps its content; CSS overflow
must instead retain flex shrink, wrapping, grid placement and authored widths.

`crates/rune/src/platform/web.rs` and `crates/rune/Cargo.toml` — WOFF fonts. `App::font_url`
hands fetched bytes straight to the text stack, which reads TrueType/OpenType only, while the
engine's font library ships WOFF2. The patch decompresses WOFF and WOFF2 (the `wuff` crate)
after the fetch.

`crates/rune-taffy` — `calc()` lengths. Taffy's `calc` feature is switched on and `rune_taffy::Calc`
is the value behind a calc pointer (`points + fraction of the basis`, optionally the smaller or
larger of two), which the store's `resolve_calc_value` reads; upstream returns 0 for every calc.
The engine's CSS host uses it for `calc(100% - 20px)`, `min(100%, 520px)` and `max()`.

`crates/rune/src/el/layout.rs` — `El::layout_style`. Rune's element builders expose a flex
subset (points, one direction, pins). The engine's CSS host needs the rest of what Taffy
already lays out: grid tracks and placement, block flow, percentages, auto margins, min and
max sizes. The patch adds one method that edits the element's whole `taffy::Style`.

`crates/rune/src/el/visual.rs`, `el/visuals.rs` and `runtime/paint/build.rs` — multiple
round cutouts on one element. Repeated `cutout_circle` calls accumulate independent
holes, each applied to the subtree through its own composite layer. The CSS host
uses this for the two radial masks on ticket edges.

`crates/rune/src/platform/web/platform.js` — SVG URLs decode through the browser's
image pipeline before upload. Rune's minimal SVG decoder omits text because it has
no font database; browser decoding preserves logo lettering and local system fonts.

`crates/rune/src/el.rs`, `el/text.rs` and `runtime/commit/{flatten,text_layout}.rs` —
`input_columns` gives a text field an intrinsic width measured from its font's zero
glyph. The CSS host supplies HTML input `size` and textarea `cols`, so percentage
and `min()` widths in auto-sized parents do not collapse around an empty value.
`input_columns_shrink` gives percentage-sized fields a zero min-content contribution
while retaining their character-based max-content width; automatic grid tracks stay
inside their viewport without losing intrinsic sizing in shrink-to-fit forms.

`crates/rune/src/pixels.rs`, `render/upload.rs` and `Cargo.toml` — browser image
frames. `Pixels::set_browser_frame` retains a canvas snapshot or a changed video
frame and wakes its consumer. Each external image has a dedicated GPU texture,
copied with `copyExternalImageToTexture`; CPU atlas uploads cannot overwrite it.
The CSS host seeds an embedded canvas once, then uses captured frame callbacks,
so static canvases need no polling or repeated UI frames. Removal releases the
browser reference, and changing dimensions reallocates only that image.
