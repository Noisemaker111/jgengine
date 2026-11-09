//! jg-ui: the engine's Rune UI layer.
//!
//! TypeScript describes the UI as a declarative tree of kit widgets (`set_spec`),
//! per-frame values arrive through one shared typed-array buffer in wasm linear
//! memory (`values_ptr`/`values_len`, written by JS once per frame, never one call
//! per value), and events plus interactive hit regions go back to JS once per
//! frame through a single import (`emit_frame`). Rune draws into a transparent
//! WebGPU canvas over the game's three.js canvas; JS uses the hit regions to let
//! pointer input on empty UI space reach the game.
//!
//! Spike scope: mount, transparency, text field, slider, button, bar, scroll,
//! shared values, event/hit-region emit. The full kit (HUD, menus, inventory,
//! map, settings, notifications) grows from here.

use std::cell::{RefCell, UnsafeCell};
use std::collections::HashMap;

use rune::tok::{self, type_};
use rune::{
    AppHandle, Compositor, Cx, Drag, El, Frame, ScrollSpec, TextEdit, Tx, col, el, row, text,
    text_input,
};
#[cfg(target_arch = "wasm32")]
use rune::{App, AppSpec, WindowOptions};
use serde::Deserialize;

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
fn val(slot: usize) -> f32 {
    unsafe { *(*VALUES.0.get()).get_unchecked(slot.min(VALUES_LEN - 1)) }
}

#[inline]
fn set_val(slot: usize, v: f32) {
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

fn emit(id: &str, kind: &'static str, value: Option<f32>, text: Option<String>) {
    EVENTS.with(|e| {
        e.borrow_mut().push(UiEvent {
            id: id.to_string(),
            kind,
            value,
            text,
        })
    });
}

// ---------------------------------------------------------------------------
// Declarative spec: the widget tree TypeScript sends as JSON.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(tag = "k", rename_all = "lowercase")]
enum Node {
    /// Vertical stack.
    Panel {
        #[serde(default)]
        children: Vec<Node>,
        #[serde(default)]
        pad: f32,
        #[serde(default)]
        gap: f32,
        #[serde(default)]
        fill: Option<String>,
        #[serde(default)]
        w: Option<f32>,
        #[serde(default)]
        h: Option<f32>,
    },
    /// Horizontal stack.
    Row {
        #[serde(default)]
        children: Vec<Node>,
        #[serde(default)]
        pad: f32,
        #[serde(default)]
        gap: f32,
        #[serde(default)]
        fill: Option<String>,
        #[serde(default)]
        w: Option<f32>,
        #[serde(default)]
        h: Option<f32>,
    },
    /// Static text, or bound text when `slot` names a value-buffer index.
    Text {
        #[serde(default)]
        text: String,
        #[serde(default)]
        slot: Option<usize>,
        #[serde(default)]
        label: Option<String>,
    },
    Button {
        id: String,
        label: String,
    },
    /// Rune-owned text field; edits flow back as events.
    Field {
        id: String,
        #[serde(default)]
        placeholder: String,
    },
    /// Drag/click slider writing its fraction (0..1) to `slot`; commits emit an event.
    Slider { id: String, slot: usize },
    /// Bar whose fill width is `val(slot) / max` of its width.
    Bar { slot: usize, #[serde(default = "default_bar_max")] max: f32 },
    /// Scrollable column.
    Scroll {
        #[serde(default)]
        children: Vec<Node>,
        #[serde(default)]
        w: Option<f32>,
        #[serde(default)]
        h: Option<f32>,
    },
    /// Fixed spacer.
    Gap { #[serde(default = "default_gap")] size: f32 },
}

fn default_bar_max() -> f32 {
    1.0
}
fn default_gap() -> f32 {
    8.0
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

#[derive(Default)]
struct Ui {
    root: Vec<Node>,
    /// TextEdit per Field node id, created when the spec is parsed.
    edits: HashMap<String, TextEdit>,
    /// Borrow fallback for a field whose edit is somehow missing.
    empty_edit: TextEdit,
}

fn parse_spec(json: &str) -> Result<(Vec<Node>, HashMap<String, TextEdit>), String> {
    #[derive(Deserialize)]
    struct Spec {
        #[serde(default)]
        children: Vec<Node>,
    }
    let spec: Spec = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let mut edits = HashMap::new();
    collect_fields(&spec.children, &mut edits);
    Ok((spec.children, edits))
}

fn collect_fields(nodes: &[Node], edits: &mut HashMap<String, TextEdit>) {
    for n in nodes {
        match n {
            Node::Field { id, .. } => {
                edits.insert(id.clone(), TextEdit::new(""));
            }
            Node::Panel { children, .. }
            | Node::Row { children, .. }
            | Node::Scroll { children, .. } => collect_fields(children, edits),
            _ => {}
        }
    }
}

// ---------------------------------------------------------------------------
// View building
// ---------------------------------------------------------------------------

fn color(hex: &str) -> rune::Color {
    rune::color::hex(hex).unwrap_or(rune::Color::BLACK)
}

fn sized(mut e: El, w: Option<f32>, h: Option<f32>) -> El {
    if let Some(w) = w {
        e = e.w(w);
    }
    if let Some(h) = h {
        e = e.h(h);
    }
    e
}

fn stack(
    children: &[Node],
    s: &Ui,
    t: &tok::Theme,
    pad: f32,
    gap: f32,
    fill: &Option<String>,
    w: Option<f32>,
    h: Option<f32>,
    horizontal: bool,
) -> El {
    let mut e = if horizontal {
        let mut r = row().gap(gap).center_y();
        for (i, n) in children.iter().enumerate() {
            r = r.child(build(n, i, s, t));
        }
        r
    } else {
        let mut c = col().gap(gap);
        for (i, n) in children.iter().enumerate() {
            c = c.child(build(n, i, s, t));
        }
        c
    };
    e = sized(e.padding(pad), w, h);
    if let Some(f) = fill {
        e = e.fill(color(f));
    }
    e
}

fn build(n: &Node, i: usize, s: &Ui, t: &tok::Theme) -> El {
    match n {
        Node::Panel {
            children,
            pad,
            gap,
            fill,
            w,
            h,
        } => stack(children, s, t, *pad, *gap, fill, *w, *h, false),
        Node::Row {
            children,
            pad,
            gap,
            fill,
            w,
            h,
        } => stack(children, s, t, *pad, *gap, fill, *w, *h, true),
        Node::Scroll { children, w, h } => {
            let mut c = col().gap(4.0);
            for (j, ch) in children.iter().enumerate() {
                c = c.child(build(ch, j, s, t));
            }
            let e = col()
                .w_full()
                .child(c)
                .scroll(ScrollSpec { stick_bottom: false })
                .hit();
            sized(e, *w, Some(h.unwrap_or(200.0)))
        }
        Node::Text {
            text: txt,
            slot,
            label,
        } => {
            let body = match slot {
                Some(k) => format!("{}", val(*k)),
                None => txt.clone(),
            };
            let e = text(body).font(type_::BODY).color(t.text);
            let e = match label {
                Some(l) => row()
                    .gap(6.0)
                    .center_y()
                    .child(text(l.clone()).font(type_::LABEL).color(t.text_secondary))
                    .child(e),
                None => e,
            };
            e.key(format!("text-{i}"))
        }
        Node::Button { id, label } => {
            let id = id.clone();
            el()
                .key(format!("btn-{id}"))
                .h(36.0)
                .px(14.0)
                .center()
                .radius(8.0)
                .fill(t.control_off)
                .child(text(label.clone()).font(type_::LABEL).color(t.text))
                .hit()
                .on_press(move |_: &mut Ui| emit(&id, "press", None, None))
        }
        Node::Field { id, placeholder } => {
            let id_key = id.clone();
            let id_edit = id.clone();
            let id_submit = id.clone();
            let ph = placeholder.clone();
            let edit = s.edits.get(id.as_str()).unwrap_or(&s.empty_edit);
            text_input(edit, type_::BODY)
                .key(format!("field-{id_key}"))
                .w_full()
                .h(36.0)
                .padding(8.0)
                .radius(8.0)
                .fill(t.card)
                .placeholder(ph, t.text_secondary)
                .hit()
                .on_edit(move |s: &mut Ui| -> &mut TextEdit {
                    s.edits.get_mut(id_edit.as_str()).unwrap_or(&mut s.empty_edit)
                })
                .on_submit(move |s: &mut Ui, _tx: &mut Tx| {
                    let text = s.edits.get(id_submit.as_str()).map(|e| e.text.clone());
                    emit(&id_submit, "submit", None, text);
                })
        }
        Node::Slider { id, slot } => {
            let id_key = id.clone();
            let id_emit = id.clone();
            let slot = *slot;
            let frac = val(slot).clamp(0.0, 1.0);
            let track_w = 200.0f32;
            let fill_w = (track_w * frac).max(6.0);
            row()
                .key(format!("slider-{id_key}"))
                .w(track_w)
                .h(24.0)
                .center_y()
                .child(
                    el()
                        .w(track_w)
                        .h(6.0)
                        .radius(3.0)
                        .fill(t.control_track)
                        .child(el().w(fill_w).h_full().radius(3.0).fill(t.indicator)),
                )
                .child(el().w(14.0).h(14.0).radius(7.0).fill(t.text))
                .hit()
                .on_drag(move |_: &mut Ui, d: &mut Drag, _tx: &mut Tx| {
                    let f = (d.x / d.w.max(1.0)).clamp(0.0, 1.0);
                    set_val(slot, f);
                    if !matches!(d.phase, rune::Phase::Move) {
                        emit(&id_emit, "slider", Some(f), None);
                    }
                })
        }
        Node::Bar { slot, max } => {
            let frac = (val(*slot) / *max).clamp(0.0, 1.0);
            el()
                .key(format!("bar-{i}"))
                .w_full()
                .h(8.0)
                .radius(4.0)
                .fill(t.control_track)
                .child(el().w(200.0 * frac).h_full().radius(4.0).fill(t.indicator))
        }
        Node::Gap { size } => el().h(*size),
    }
}

fn view(s: &Ui, cx: &mut Cx<Ui>) -> El {
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    let mut c = col().w_full().h_full().padding(16.0).gap(8.0);
    for (i, n) in s.root.iter().enumerate() {
        c = c.child(build(n, i, s, &t));
    }
    c.key("root")
}

// ---------------------------------------------------------------------------
// Compositor: default Rune draw + one emit per frame with events and the
// interactive hit regions JS needs for pointer pass-through. animating() keeps
// the display link running so the HUD redraws every frame like the game.
// ---------------------------------------------------------------------------

struct UiCompositor;

impl Compositor<Ui> for UiCompositor {
    fn render(&mut self, f: &mut Frame<'_, Ui>) {
        f.draw_ui();
        let events: Vec<UiEvent> = EVENTS.with(|e| std::mem::take(&mut *e.borrow_mut()));
        let regions: Vec<[f32; 4]> = f.rt.hit_regions().to_vec();
        let payload = serde_json::json!({
            "events": events,
            "regions": regions,
        })
        .to_string();
        #[cfg(target_arch = "wasm32")]
        emit_frame(&payload);
        let _ = payload;
    }

    fn animating(&self) -> bool {
        true
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

/// Mount the Rune UI on an existing canvas element and start its loop.
/// Call once, after the canvas is in the DOM.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn echo_len(s: &str) -> u32 {
    web_sys::console::log_1(&format!("echo_len '{}' len={}", s, s.len()).into());
    s.len() as u32
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn mount(canvas_id: &str) {
    web_sys::console::log_1(&format!("jg-ui mount canvas_id='{canvas_id}' len={}", canvas_id.len()).into());
    let mut spec = AppSpec::new("jg-ui", (800.0, 600.0), Ui::default, view);
    spec.poll = Some(|_s: &mut Ui, _t: f64, _tx: &mut Tx| true);
    let app = App::new(spec)
        .canvas_id(canvas_id.to_string())
        .full_viewport()
        .window_options(WindowOptions {
            transparent: true,
            ..Default::default()
        })
        .compositor(UiCompositor);
    let handle = app.handle();
    HANDLE.with(|h| *h.borrow_mut() = Some(handle.clone()));
    app.run();
}

/// Replace the whole widget tree. Rare: structure changes, not per-frame values.
/// Field edits for ids that survive are kept.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn set_spec(json: &str) {
    let (root, edits) = match parse_spec(json) {
        Ok(v) => v,
        Err(e) => {
            emit("__spec__", "error", None, Some(e));
            return;
        }
    };
    HANDLE.with(|h| {
        if let Some(handle) = h.borrow().as_ref() {
            handle.update(move |s: &mut Ui, _tx: &mut Tx| {
                s.root = root;
                s.edits.retain(|id, _| edits.contains_key(id));
                for (id, e) in edits {
                    s.edits.entry(id).or_insert(e);
                }
            });
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
