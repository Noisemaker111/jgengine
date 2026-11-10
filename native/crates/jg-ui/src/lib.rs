//! jg-ui: the engine's Rune UI layer.
//!
//! TypeScript describes the UI as a declarative tree of kit widgets (`set_spec`),
//! per-frame values arrive through one shared typed-array buffer in wasm linear
//! memory (`values_ptr`/`values_len`, written by JS once per frame, never one call
//! per value), and events plus interactive hit regions go back to JS once per
//! frame through a single import (`emit_frame`). Rune draws into a transparent
//! WebGPU canvas over the game's three.js canvas; JS uses the hit regions to let
//! pointer input on empty UI space reach the game.

// The wasm exports are the only entry points; on host targets (cargo check,
// tests) everything below them is unreachable by construction.
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

mod build;
mod css;
mod spec;
mod native;
mod style;
mod widgets;
#[cfg(test)]
mod blend_tests;

use std::cell::{Cell, RefCell, UnsafeCell};
use std::collections::HashMap;

use rune::{AppHandle, Color, Compositor, Cx, El, Frame, TextEdit};
#[cfg(target_arch = "wasm32")]
use rune::{App, AppSpec, Tx, WindowOptions};

pub(crate) use spec::Node;

/// Render native JSX wire data through the production builder to a headless PNG.
#[cfg(not(target_arch = "wasm32"))]
pub fn native_png(json: &str, path: &std::path::Path, width: u32, height: u32, fonts: &[&'static [u8]]) -> Result<(), String> {
    if width == 0 || height == 0 || width > 8192 || height > 8192 { return Err("PNG dimensions must be in 1..8192".into()); }
    let spec = spec::parse_spec(json)?;
    if !spec.children.iter().all(|node| matches!(node, Node::Native(_))) { return Err("native PNG accepts only native JSX elements".into()); }
    let mut state = Ui::default();
    state.root = spec.children;
    let mut runtime = rune::Runtime::with_text(state, build::view, (width as f32,height as f32), rune::Env::new(true,1.0), rune::text::TextSystem::new(fonts,("Inter","IBM Plex Mono")));
    runtime.set_srgb_blend(true);
    runtime.frame(0.0);
    let gpu = rune::render::Gpu::headless();
    let format = rune::render::OFFSCREEN_FORMAT.remove_srgb_suffix();
    let mut renderer = rune::render::Renderer::new(&gpu.device,format);
    renderer.set_srgb_blend(true);
    let target = rune::render::Offscreen::with_format(&gpu.device,width,height,format);
    renderer.upload_images(&gpu.device,&gpu.queue,&mut runtime.images);
    renderer.prepare(&gpu.device,&gpu.queue,&mut runtime.text.atlas,&runtime.instances,(width,height));
    let mut encoder = gpu.device.create_command_encoder(&Default::default());
    renderer.draw(&mut encoder,&target.view,[0.0;4]);
    target.copy(&mut encoder);
    renderer.submit(&gpu.queue,encoder);
    rune::render::write_png(path,width,height,&target.read(&gpu.device)).map_err(|error|error.to_string())
}

// ---------------------------------------------------------------------------
// Shared per-frame value buffer: plain f32 slots in wasm linear memory. JS gets
// a Float32Array over `values_ptr()`/`values_len()` and writes once per frame.
// Widgets read slots by index while building the view. Rust may also write a
// slot (e.g. a dragged slider) so the next frame is already correct.
// ---------------------------------------------------------------------------

const VALUES_LEN: usize = 8192;

thread_local! { static DRAW_COUNT: Cell<u32> = const { Cell::new(0) }; }

/// Actual native render submissions, including frames with no JS event payload.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn frames_drawn() -> u32 { DRAW_COUNT.get() }

/// The shared buffer lives in wasm linear memory: JS writes it through a
/// Float32Array view and the view code reads it on the same single thread.
struct SharedValues(UnsafeCell<[f32; VALUES_LEN]>);
unsafe impl Sync for SharedValues {}

static VALUES: SharedValues = SharedValues(UnsafeCell::new([0.0; VALUES_LEN]));

#[inline]
pub(crate) fn val(slot: usize) -> f32 {
    unsafe { *(*VALUES.0.get()).get_unchecked(slot.min(VALUES_LEN - 1)) }
}

#[inline]
pub(crate) fn set_val(slot: usize, v: f32) {
    unsafe {
        let s = &mut *VALUES.0.get();
        if slot < VALUES_LEN {
            s[slot] = v;
        }
    }
}

// ---------------------------------------------------------------------------
// Events: pushed by widget handlers, drained once per frame by the compositor
// and shipped to JS as one JSON payload together with hit regions.
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
struct UiEvent {
    id: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scroll: Option<[f32; 6]>,
}

thread_local! {
    static EVENTS: RefCell<Vec<UiEvent>> = const { RefCell::new(Vec::new()) };
}

pub(crate) fn emit(id: &str, kind: &'static str, value: Option<f32>, text: Option<String>) {
    EVENTS.with(|e| {
        e.borrow_mut().push(UiEvent {
            id: id.to_string(),
            kind,
            value,
            text,
            scroll: None,
        })
    });
}

/// Ask for one more frame from outside a handler (an image finished decoding).
pub(crate) fn wake() {
    #[cfg(target_arch = "wasm32")]
    HANDLE.with(|h| {
        if let Some(handle) = h.borrow().as_ref() {
            handle.update(|_s: &mut Ui, _tx: &mut Tx| {});
        }
    });
}

/// An event from a CSS box, addressed by its numeric id as `x<id>`.
pub(crate) fn emit_id(id: u32, kind: &'static str, value: Option<f32>, text: Option<String>) {
    emit(&format!("x{id}"), kind, value, text);
}

pub(crate) fn emit_scroll(id: u32, at: rune::ScrollPos) {
    EVENTS.with(|events| events.borrow_mut().push(UiEvent {
        id: format!("x{id}"), kind: "scroll", value: None, text: None,
        scroll: Some([at.offset[0], at.offset[1], at.viewport[0], at.viewport[1], at.viewport[0] + at.max[0], at.viewport[1] + at.max[1]]),
    }));
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct Ui {
    root: Vec<Node>,
    revision: u64,
    page_revision: u32,
    rendered_revision: Cell<u64>,
    rendered_page_revision: Cell<u32>,
    cache: css::BoxCache,
    /// While true the bridge treats the UI as modal: game input is suspended
    /// and the pointer is shown.
    modal: bool,
    /// TextEdit per Field node id, created when the spec is parsed and kept
    /// across rebuilds while the id survives.
    edits: HashMap<String, TextEdit>,
    /// Borrow fallback for a field whose edit is somehow missing.
    empty_edit: TextEdit,
    /// Last page-side revision applied per CSS field; a new one replaces the field's text.
    edit_rev: HashMap<String, u32>,
}

/// `#rgb`/`#rrggbb`/`#rrggbbaa` to a Rune colour; anything else is opaque black.
pub(crate) fn color(hex: &str) -> Color {
    rune::color::hex(hex).unwrap_or(Color::BLACK)
}

fn view(s: &Ui, cx: &mut Cx<Ui>) -> El {
    build::view(s, cx)
}

// ---------------------------------------------------------------------------
// Compositor: default Rune draw + one emit per frame with events, the
// interactive hit regions JS needs for pointer pass-through, and the modal
// flag. animating() keeps the display link running so the HUD redraws every
// frame like the game.
// ---------------------------------------------------------------------------

struct UiCompositor {
    /// Last text shipped per field id; `on_edit` is an accessor Rune calls for
    /// layout and paint too, so changes are diffed here once per frame instead.
    edit_last: HashMap<String, String>,
    /// Last frame payload shipped to JS; static frames skip the JSON round trip.
    last_regions: Vec<[f32; 4]>,
    last_modal: bool,
    last_revision: u64,
    shipped: bool,
}

fn layout_snapshot(runtime: &rune::Runtime<Ui>) -> Vec<[f32; 5]> {
    runtime.layout_rects().filter_map(|(key, rect)| {
        let id: u32 = key.strip_prefix('x')?.parse().ok()?;
        Some([id as f32, rect[0], rect[1], rect[2], rect[3]])
    }).collect()
}

impl Compositor<Ui> for UiCompositor {
    fn render(&mut self, f: &mut Frame<'_, Ui>) {
        DRAW_COUNT.set(DRAW_COUNT.get().wrapping_add(1));
        f.draw_ui();
        for (id, edit) in &f.rt.state.edits {
            let cur = edit.text.clone();
            if self.edit_last.get(id).map(String::as_str) != Some(cur.as_str()) {
                self.edit_last.insert(id.clone(), cur.clone());
                emit(id, "edit", None, Some(cur));
            }
        }
        self.edit_last.retain(|id, _| f.rt.state.edits.contains_key(id));
        let events: Vec<UiEvent> = EVENTS.with(|e| std::mem::take(&mut *e.borrow_mut()));
        let regions: Vec<[f32; 4]> = f.rt.hit_regions().to_vec();
        let modal = f.rt.state.modal;
        let revision_changed = !self.shipped || self.last_revision != f.rt.state.rendered_revision.get();
        if self.shipped && events.is_empty() && modal == self.last_modal && regions == self.last_regions && !css::RECTS_DIRTY.get() && !revision_changed {
            return;
        }
        self.shipped = true;
        self.last_modal = modal;
        self.last_revision = f.rt.state.rendered_revision.get();
        self.last_regions = regions.clone();
        let rects_changed = css::RECTS_DIRTY.replace(false);
        let rects: Vec<[f32; 5]> = if rects_changed || revision_changed {
            layout_snapshot(f.rt)
        } else {
            Vec::new()
        };
        let payload = serde_json::json!({
            "revision": f.rt.state.rendered_page_revision.get(),
            "events": events,
            "regions": regions,
            "modal": modal,
            "rects": rects,
            "nativeRects": f.rt.layout_rects().filter(|(key, _)| key.starts_with('n')).collect::<Vec<_>>(),
        })
        .to_string();
        #[cfg(target_arch = "wasm32")]
        emit_frame(&payload);
        let _ = payload;
    }

    /// No compositor-driven animation: frames run only when state changes
    /// (spec updates, input, timers) or JS reports bound values moved
    /// (`values_changed`). An idle HUD costs no draw and no present.
    fn animating(&self) -> bool {
        false
    }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen(inline_js = "
export function emit_frame(payload) { window.__jgUiFrame && window.__jgUiFrame(payload); }
")]
extern "C" {
    fn emit_frame(payload: &str);
}

// ---------------------------------------------------------------------------
// wasm exports (web build). On native targets the lib still compiles for tests.
// ---------------------------------------------------------------------------

thread_local! {
    static HANDLE: RefCell<Option<AppHandle<Ui>>> = const { RefCell::new(None) };
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn values_ptr() -> u32 {
    VALUES.0.get() as u32
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn values_len() -> u32 {
    VALUES_LEN as u32
}

/// Mount options: `{"fonts": ["/fonts/x.ttf", ...], "sans": "Family", "mono": "Family"}`.
/// Font files must be TrueType/OpenType (not WOFF); they are fetched relative to
/// the page while the GPU starts.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn mount(canvas_id: &str, options_json: &str) {
    #[derive(serde::Deserialize, Default)]
    struct Opts {
        #[serde(default)]
        fonts: Vec<String>,
        #[serde(default)]
        sans: Option<String>,
        #[serde(default)]
        mono: Option<String>,
    }
    let opts: Opts = serde_json::from_str(options_json).unwrap_or_default();
    let leak = |s: &str| -> &'static str { Box::leak(s.to_string().into_boxed_str()) };
    let sans = leak(opts.sans.as_deref().unwrap_or("Inter"));
    let mono = leak(opts.mono.as_deref().unwrap_or("ui-monospace, monospace"));
    // No `poll`: JS pushes every change (spec, values, input), so the view
    // never needs to ask whether something moved.
    let mut spec = AppSpec::new("jg-ui", (800.0, 600.0), Ui::default, view);
    spec.families = (sans, mono);
    let mut app = App::new(spec)
        .canvas_id(canvas_id.to_string())
        .full_viewport()
        .window_options(WindowOptions {
            transparent: true,
            ..Default::default()
        })
        .compositor(UiCompositor {
            edit_last: HashMap::new(),
            last_regions: Vec::new(),
            last_modal: false,
            last_revision: 0,
            shipped: false,
        });
    for url in &opts.fonts {
        app = app.font_url(url);
    }
    let handle = app.handle();
    HANDLE.with(|h| *h.borrow_mut() = Some(handle.clone()));
    app.run();
}

/// Replace the whole widget tree. Rare: structure changes, not per-frame values.
/// Field edits for ids that survive are kept.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn set_spec(json: &str, revision: u32) {
    let parsed = spec::parse_spec(json);
    let (children, modal) = match parsed {
        Ok(p) => (p.children, p.modal),
        Err(e) => {
            emit("__spec__", "error", None, Some(e));
            return;
        }
    };
    HANDLE.with(|h| {
        if let Some(handle) = h.borrow().as_ref() {
            handle.update(move |s: &mut Ui, tx: &mut Tx| {
                // The page decides what moves: a box it adds or removes is there or gone in this frame,
                // as in the DOM, not faded by Rune's default entrance and exit.
                tx.instant();
                s.root = children;
                s.page_revision = revision;
                s.modal = modal;
                sync_fields(s);
            });
        }
    });
}

/// Bring the edit store in line with the tree's fields: drop edits whose field is gone, make
/// one for each new field, and take the page's text where it set a field itself.
#[cfg(target_arch = "wasm32")]
fn sync_fields(s: &mut Ui) {
    s.revision = s.revision.wrapping_add(1);
    let ids = spec::field_ids(&s.root);
    s.edits.retain(|id, _| ids.contains(id));
    spec::collect_fields(&s.root, &mut s.edits);
    let mut fields = Vec::new();
    css::fields(&s.root, &mut fields);
    for (key, inp) in fields {
        let known = s.edit_rev.get(&key).copied();
        if known != Some(inp.rev) || !s.edits.contains_key(&key) {
            s.edit_rev.insert(key.clone(), inp.rev);
            s.edits.insert(key, TextEdit::new(inp.v.clone()));
        }
    }
    s.edit_rev.retain(|id, _| ids.contains(id));
}

/// Replace CSS boxes in place: `[{"k":"x","id":N,...}, ...]`, each taking the place of the box
/// that has its id. A box that is not in the tree is skipped. This is how a changed subtree
/// reaches Rune without the whole tree being sent again.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn patch(json: &str, revision: u32) {
    let boxes: Vec<css::Box_> = match serde_json::from_str(json) {
        Ok(b) => b,
        Err(e) => {
            emit("__spec__", "error", None, Some(e.to_string()));
            return;
        }
    };
    HANDLE.with(|h| {
        if let Some(handle) = h.borrow().as_ref() {
            handle.update(move |s: &mut Ui, tx: &mut Tx| {
                // The page decides what moves: a box it adds or removes is there or gone in this frame,
                // as in the DOM, not faded by Rune's default entrance and exit.
                tx.instant();
                let mut fields = false;
                for b in boxes {
                    let id = b.id;
                    if let Some(slot) = css::find_mut(&mut s.root, id) {
                        fields = true;
                        *slot = b;
                    } else {
                        // The page's tree and this one have parted; it sends the whole tree again.
                        emit("__spec__", "missing", None, Some(format!("patch for box {id}, which this tree does not hold")));
                    }
                }
                if fields {
                    s.page_revision = revision;
                    sync_fields(s);
                }
            });
        }
    });
}

/// Replace one CSS box's text: `json` is its text record, or `null` for none. The per-change
/// path for a number or label that moves: no layout or paint field is parsed again.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn patch_text(id: u32, json: &str, revision: u32) {
    let text: Option<css::Txt> = match serde_json::from_str(json) {
        Ok(t) => t,
        Err(e) => {
            emit("__spec__", "error", None, Some(e.to_string()));
            return;
        }
    };
    HANDLE.with(|h| {
        if let Some(handle) = h.borrow().as_ref() {
            handle.update(move |s: &mut Ui, tx: &mut Tx| {
                // The page decides what moves: a box it adds or removes is there or gone in this frame,
                // as in the DOM, not faded by Rune's default entrance and exit.
                tx.instant();
                if let Some(slot) = css::find_mut(&mut s.root, id) {
                    slot.t = text;
                    s.page_revision = revision;
                    s.revision = s.revision.wrapping_add(1);
                }
            });
        }
    });
}

/// Move a keyed CSS scroller without rebuilding its view.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn scroll_native_into_view(id: &str) {
    HANDLE.with(|handle| {
        if let Some(handle) = handle.borrow().as_ref() {
            let id = id.to_owned();
            handle.update(move |_: &mut Ui, tx: &mut Tx| { tx.live_only(); tx.scroll_into_view(id); });
        }
    });
}

/// Move a keyed CSS scroller without rebuilding its view.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn scroll_to(id: u32, x: f32, y: f32, smooth: bool) {
    HANDLE.with(|handle| {
        if let Some(handle) = handle.borrow().as_ref() {
            handle.update(move |_: &mut Ui, tx: &mut Tx| {
                tx.live_only();
                if smooth { tx.scroll_to(format!("x{id}"), x, y); }
                else { tx.scroll_to_instant(format!("x{id}"), x, y); }
            });
        }
    });
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn canvas_frame(id: u32, source: web_sys::HtmlElement) -> Result<(), wasm_bindgen::JsValue> {
    if widgets::canvas_frame(id, source)? {
        HANDLE.with(|handle| {
            if let Some(handle) = handle.borrow().as_ref() {
                handle.update(|state: &mut Ui, tx: &mut Tx| { state.revision = state.revision.wrapping_add(1); tx.instant(); });
            }
        });
    }
    Ok(())
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn remove_canvas(id: u32) {
    widgets::remove_canvas(id);
    HANDLE.with(|handle| {
        if let Some(handle) = handle.borrow().as_ref() {
            handle.update(|state: &mut Ui, tx: &mut Tx| { state.revision = state.revision.wrapping_add(1); tx.instant(); });
        }
    });
}

/// JS wrote bound values that may have changed pixels: commit one frame.
/// Called only when the JS-side diff saw a value move, never per frame.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn values_changed() {
    HANDLE.with(|h| {
        if let Some(handle) = h.borrow().as_ref() {
            handle.update(|_s: &mut Ui, tx: &mut Tx| tx.instant());
        }
    });
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn unmount() {
    widgets::clear_canvases();
    HANDLE.with(|h| {
        if let Some(handle) = h.borrow().as_ref() {
            handle.quit();
        }
    });
}
