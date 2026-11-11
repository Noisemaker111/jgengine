//! jg-ui: the engine's Rune UI layer.
//!
//! TypeScript describes the UI as a tree of native Rune nodes (`set_spec`, `native.rs`),
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
mod spec;
mod native;
mod widgets;

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
    sync_fields(&mut state);
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
    // Events ship with the next frame; a settled surface draws none, so a press on a still
    // HUD would wait for the following input. Ask for that frame now.
    wake();
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
    native_rects_dirty: Cell<bool>,
    /// Whether the view has built once, so the first build sweeps the image cache.
    built: Cell<bool>,
    /// While true the bridge treats the UI as modal: game input is suspended
    /// and the pointer is shown.
    modal: bool,
    /// TextEdit per Field node id, created when the spec is parsed and kept
    /// across rebuilds while the id survives.
    edits: HashMap<String, TextEdit>,
    /// Borrow fallback for a field whose edit is somehow missing.
    empty_edit: TextEdit,
    /// Last page-side revision applied per native field; a new one replaces the field's text.
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
    /// Last focus shipped per field id.
    focus_last: HashMap<String, bool>,
    /// Last frame payload shipped to JS; static frames skip the JSON round trip.
    last_regions: Vec<[f32; 4]>,
    last_modal: bool,
    last_revision: u64,
    shipped: bool,
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
        // The page routes keys to a focused field and raises the phone keyboard for it.
        for (id, edit) in &f.rt.state.edits {
            if self.focus_last.get(id).copied().unwrap_or(false) != edit.focused {
                self.focus_last.insert(id.clone(), edit.focused);
                emit(id, if edit.focused { "focus" } else { "blur" }, None, None);
            }
        }
        self.focus_last.retain(|id, _| f.rt.state.edits.contains_key(id));
        let events: Vec<UiEvent> = EVENTS.with(|e| std::mem::take(&mut *e.borrow_mut()));
        let regions: Vec<[f32; 4]> = f.rt.hit_regions().to_vec();
        let modal = f.rt.state.modal;
        let revision_changed = !self.shipped || self.last_revision != f.rt.state.rendered_revision.get();
        if self.shipped && events.is_empty() && modal == self.last_modal && regions == self.last_regions && !f.rt.state.native_rects_dirty.get() && !revision_changed {
            return;
        }
        self.shipped = true;
        self.last_modal = modal;
        self.last_revision = f.rt.state.rendered_revision.get();
        self.last_regions = regions.clone();
        f.rt.state.native_rects_dirty.set(false);
        let payload = serde_json::json!({
            "revision": f.rt.state.rendered_page_revision.get(),
            "events": events,
            "regions": regions,
            "modal": modal,
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
            focus_last: HashMap::new(),
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

/// Patch native leaf properties without replacing the tree or invalidating sibling memo entries.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn patch_native(json: &str) {
    let patches: Vec<native::PropertyPatch> = match serde_json::from_str(json) {
        Ok(value) => value,
        Err(error) => { emit("__native__", "error", None, Some(error.to_string())); return; }
    };
    HANDLE.with(|handle| {
        if let Some(handle) = handle.borrow().as_ref() {
            handle.update(move |state: &mut Ui, tx: &mut Tx| {
                tx.instant();
                match native::patch(&mut state.root, &patches) {
                    Ok(()) => state.native_rects_dirty.set(true),
                    Err(error) => emit("__native__", "error", None, Some(error)),
                }
            });
        }
    });
}

/// Bring the edit store in line with the tree's fields: drop edits whose field is gone, make
/// one for each new field, and take the page's text where it set a field itself.
fn sync_fields(s: &mut Ui) {
    s.revision = s.revision.wrapping_add(1);
    let ids = spec::field_ids(&s.root);
    s.edits.retain(|id, _| ids.contains(id));
    let mut taken: Vec<(String, u32, String)> = Vec::new();
    let mut natives = Vec::new();
    native::fields(&s.root, &mut natives);
    taken.extend(natives.into_iter().map(|(id, p)| (id.to_owned(), p.rev, p.value.clone().unwrap_or_default())));
    for (key, rev, text) in taken {
        let known = s.edit_rev.get(&key).copied();
        if known != Some(rev) || !s.edits.contains_key(&key) {
            s.edit_rev.insert(key.clone(), rev);
            // A page-side replacement keeps the field's focus and puts the caret at the end.
            let focused = s.edits.get(&key).is_some_and(|edit| edit.focused);
            let mut edit = TextEdit::new(text);
            edit.focused = focused;
            s.edits.insert(key, edit);
        }
    }
    s.edit_rev.retain(|id, _| ids.contains(id));
}

/// Scroll a keyed native node into view without rebuilding the tree.
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

/// Give a native field keyboard focus (the page's keyboard or pad chose it).
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn focus_native(id: &str) {
    HANDLE.with(|handle| {
        if let Some(handle) = handle.borrow().as_ref() {
            let id = id.to_owned();
            handle.update(move |_: &mut Ui, tx: &mut Tx| tx.focus(id, true));
        }
    });
}

/// Drop native keyboard focus: Escape leaving a field.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn blur_native() {
    HANDLE.with(|handle| {
        if let Some(handle) = handle.borrow().as_ref() {
            handle.update(move |_: &mut Ui, tx: &mut Tx| tx.blur());
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
    HANDLE.with(|h| {
        if let Some(handle) = h.borrow().as_ref() {
            handle.quit();
        }
    });
}
