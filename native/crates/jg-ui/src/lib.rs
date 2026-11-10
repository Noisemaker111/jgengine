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
mod style;
mod widgets;

use std::cell::{RefCell, UnsafeCell};
use std::collections::HashMap;

use rune::{AppHandle, Color, Compositor, Cx, El, Frame, TextEdit};
#[cfg(target_arch = "wasm32")]
use rune::{App, AppSpec, Tx, WindowOptions};

pub(crate) use spec::Node;

// ---------------------------------------------------------------------------
// Shared per-frame value buffer: plain f32 slots in wasm linear memory. JS gets
// a Float32Array over `values_ptr()`/`values_len()` and writes once per frame.
// Widgets read slots by index while building the view. Rust may also write a
// slot (e.g. a dragged slider) so the next frame is already correct.
// ---------------------------------------------------------------------------

const VALUES_LEN: usize = 8192;

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
        })
    });
}

/// An event from a CSS box, addressed by its numeric id as `x<id>`.
pub(crate) fn emit_id(id: u32, kind: &'static str, value: Option<f32>, text: Option<String>) {
    emit(&format!("x{id}"), kind, value, text);
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct Ui {
    root: Vec<Node>,
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
    shipped: bool,
}

impl Compositor<Ui> for UiCompositor {
    fn render(&mut self, f: &mut Frame<'_, Ui>) {
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
        if self.shipped && events.is_empty() && modal == self.last_modal && regions == self.last_regions && !css::RECTS_DIRTY.get() {
            return;
        }
        self.shipped = true;
        self.last_modal = modal;
        self.last_regions = regions.clone();
        let rects: Vec<[f32; 5]> = if css::RECTS_DIRTY.replace(false) {
            css::RECTS.with(|r| r.borrow().iter().map(|(id, r)| [*id as f32, r[0], r[1], r[2], r[3]]).collect())
        } else {
            Vec::new()
        };
        let payload = serde_json::json!({
            "events": events,
            "regions": regions,
            "modal": modal,
            "rects": rects,
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
pub fn set_spec(json: &str) {
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
            handle.update(move |s: &mut Ui, _tx: &mut Tx| {
                let ids = spec::field_ids(&children);
                s.edits.retain(|id, _| ids.contains(id));
                spec::collect_fields(&children, &mut s.edits);
                let mut fields = Vec::new();
                css::fields(&children, &mut fields);
                for (key, inp) in fields {
                    let known = s.edit_rev.get(&key).copied();
                    if known != Some(inp.rev) || !s.edits.contains_key(&key) {
                        s.edit_rev.insert(key.clone(), inp.rev);
                        s.edits.insert(key, TextEdit::new(inp.v.clone()));
                    }
                }
                s.edit_rev.retain(|id, _| ids.contains(id));
                s.root = children;
                s.modal = modal;
            });
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
            handle.update(|_s: &mut Ui, _tx: &mut Tx| {});
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
