//! The declarative widget tree TypeScript sends as JSON (`set_spec`).
//!
//! Every node is `{ k: "<kind>", ...fields }`. Per-frame numbers never travel in
//! the spec: a node names a slot in the shared value buffer (`slot: <index>`)
//! and the view reads it while building each frame. Structure changes (a menu
//! opening, a row appearing) rebuild the spec; values do not.

use serde::Deserialize;

/// Colours a reading can take as it crosses thresholds: good, warn, bad.
/// `warn`/`bad` are compared against the slot value: `<= bad` takes
/// `colors[2]`, `<= warn` takes `colors[1]`, anything above takes `colors[0]`.
#[derive(Deserialize, Clone)]
pub struct Tone {
    pub colors: [String; 3],
    #[serde(default)]
    pub warn: f32,
    #[serde(default)]
    pub bad: f32,
}

/// Box and flow styling shared by containers and widgets.
#[derive(Deserialize, Default, Clone)]
pub struct Style {
    #[serde(default)]
    pub fill: Option<String>,
    #[serde(default)]
    pub fill_top: Option<String>,
    #[serde(default)]
    pub fill_bottom: Option<String>,
    #[serde(default)]
    pub radius: Option<f32>,
    #[serde(default)]
    pub border: Option<f32>,
    #[serde(default)]
    pub border_color: Option<String>,
    #[serde(default)]
    pub w: Option<f32>,
    #[serde(default)]
    pub h: Option<f32>,
    #[serde(default)]
    pub min_h: Option<f32>,
    #[serde(default)]
    pub max_h: Option<f32>,
    #[serde(default)]
    pub w_full: bool,
    #[serde(default)]
    pub h_full: bool,
    #[serde(default)]
    pub pad: Option<f32>,
    #[serde(default)]
    pub px: Option<f32>,
    #[serde(default)]
    pub py: Option<f32>,
    #[serde(default)]
    pub pt: Option<f32>,
    #[serde(default)]
    pub pb: Option<f32>,
    #[serde(default)]
    pub pl: Option<f32>,
    #[serde(default)]
    pub pr: Option<f32>,
    #[serde(default)]
    pub gap: Option<f32>,
    /// Absolute position `[left, top]` inside the parent.
    #[serde(default)]
    pub abs: Option<[f32; 2]>,
    /// Pin distances `[left, top, right, bottom]`; `null` leaves that edge free.
    #[serde(default)]
    pub pin: Option<[Option<f32>; 4]>,
    /// Value-buffer slot holding an opacity in 0..=1, written every frame.
    #[serde(default)]
    pub opacity: Option<usize>,
    /// Main axis: "start" | "center" | "end" | "between" | "evenly".
    #[serde(default)]
    pub justify: Option<String>,
    /// Cross axis: "start" | "center" | "end" | "stretch".
    #[serde(default)]
    pub items: Option<String>,
    #[serde(default)]
    pub grow: Option<f32>,
    #[serde(default)]
    pub shrink: Option<bool>,
}

#[derive(Deserialize)]
#[serde(tag = "k", rename_all = "lowercase")]
pub enum Node {
    /// Vertical stack.
    Panel {
        #[serde(default)]
        children: Vec<Node>,
        #[serde(flatten)]
        style: Style,
    },
    /// Horizontal stack, children vertically centred unless `items` says otherwise.
    Row {
        #[serde(default)]
        children: Vec<Node>,
        #[serde(flatten)]
        style: Style,
    },
    /// Scrollable vertical stack.
    Scroll {
        #[serde(default)]
        children: Vec<Node>,
        #[serde(flatten)]
        style: Style,
    },
    /// Static text, or slot-bound text when `slot` names a value-buffer index.
    Text {
        #[serde(default)]
        text: String,
        #[serde(default)]
        slot: Option<usize>,
        /// Fraction digits for a slot number (default 0).
        #[serde(default)]
        decimals: Option<usize>,
        #[serde(default)]
        prefix: Option<String>,
        #[serde(default)]
        suffix: Option<String>,
        /// Dim label drawn before the value.
        #[serde(default)]
        label: Option<String>,
        #[serde(default)]
        size: Option<f32>,
        #[serde(default)]
        weight: Option<f32>,
        #[serde(default)]
        mono: bool,
        #[serde(default)]
        color: Option<String>,
        /// "upper" | "lower".
        #[serde(default)]
        case: Option<String>,
        /// "left" | "center" | "right".
        #[serde(default)]
        align: Option<String>,
        #[serde(default)]
        tracking: Option<f32>,
        #[serde(default)]
        tone: Option<Tone>,
        #[serde(default)]
        opacity: Option<usize>,
    },
    /// Segmented 0..`max` meter: `count` cells, lit to the slot value, toned.
    Cells {
        slot: usize,
        #[serde(default = "default_meter_max")]
        max: f32,
        #[serde(default = "default_cells")]
        count: usize,
        tone: Tone,
        #[serde(default)]
        cell_w: Option<f32>,
        #[serde(default)]
        cell_h: Option<f32>,
        #[serde(default)]
        gap: Option<f32>,
    },
    /// A 270° gauge arc with `children` centred inside it. `slot`/`max` give the
    /// remaining fraction; `tone` colours the arc and `children` read their own
    /// slots for the numbers.
    Dial {
        slot: usize,
        #[serde(default = "default_meter_max")]
        max: f32,
        #[serde(default = "default_dial_size")]
        size: f32,
        tone: Tone,
        #[serde(default)]
        children: Vec<Node>,
    },
    /// Clickable plate. `active` is a 0/1 slot that switches it to the accent
    /// style; `hint` draws dim text under the label.
    Button {
        id: String,
        label: String,
        #[serde(default)]
        hint: Option<String>,
        #[serde(default)]
        active: Option<usize>,
        #[serde(default)]
        disabled: bool,
        /// Accent colour for the active state (default amber).
        #[serde(default)]
        color: Option<String>,
        #[serde(flatten)]
        style: Style,
    },
    /// Rune-owned text field; edits flow back as `edit`/`submit` events.
    Field {
        id: String,
        #[serde(default)]
        placeholder: String,
        /// Initial text, applied when the field is first created.
        #[serde(default)]
        text: Option<String>,
        #[serde(default)]
        mono: bool,
        #[serde(flatten)]
        style: Style,
    },
    /// Drag/click slider writing its fraction (0..1) to `slot`; commits emit an event.
    Slider {
        id: String,
        slot: usize,
        #[serde(default)]
        w: Option<f32>,
        #[serde(default)]
        color: Option<String>,
    },
    /// Switch bound to a 0/1 slot; a press flips it and emits a `toggle` event.
    Toggle {
        id: String,
        slot: usize,
        #[serde(default)]
        label: Option<String>,
        #[serde(flatten)]
        style: Style,
    },
    /// Option cycler: click steps `slot` (an index into `options`) and emits `select`.
    Select {
        id: String,
        options: Vec<String>,
        slot: usize,
        #[serde(default)]
        label: Option<String>,
    },
    /// Bar whose fill is `val(slot) / max` of its width.
    Bar {
        slot: usize,
        #[serde(default = "default_meter_max")]
        max: f32,
        #[serde(default)]
        h: Option<f32>,
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        track: Option<String>,
    },
    /// Fixed spacer.
    Gap {
        #[serde(default = "default_gap")]
        size: f32,
    },
    /// A key cap: small mono plate with the key's legend.
    Kbd { text: String },
    /// A game-icons.net style SVG drawn as an icon. `svg` is the icon's inner
    /// SVG body on a 24×24 viewBox (e.g. `<path d="…"/>`).
    Icon {
        svg: String,
        #[serde(default)]
        size: Option<f32>,
        #[serde(default)]
        color: Option<String>,
    },
    /// A generic CSS box: resolved layout, paint and text (`css.rs`).
    X(Box<crate::css::Box_>),
    /// A 1px rule line.
    Line {
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        h: Option<f32>,
    },
}

fn default_meter_max() -> f32 {
    100.0
}
fn default_cells() -> usize {
    10
}
fn default_dial_size() -> f32 {
    120.0
}
fn default_gap() -> f32 {
    8.0
}

/// The parsed top-level spec.
pub struct Spec {
    pub children: Vec<Node>,
    /// While true the bridge treats the UI as modal: it hides game input and
    /// shows the cursor.
    pub modal: bool,
}

pub fn parse_spec(json: &str) -> Result<Spec, String> {
    #[derive(Deserialize)]
    struct Raw {
        #[serde(default)]
        children: Vec<Node>,
        #[serde(default)]
        modal: bool,
    }
    let raw: Raw = serde_json::from_str(json).map_err(|e| e.to_string())?;
    Ok(Spec {
        children: raw.children,
        modal: raw.modal,
    })
}

/// Every `Field` id in the tree.
pub fn field_ids(nodes: &[Node]) -> std::collections::HashSet<String> {
    fn walk(nodes: &[Node], out: &mut std::collections::HashSet<String>) {
        for n in nodes {
            match n {
                Node::Field { id, .. } => {
                    out.insert(id.clone());
                }
                Node::Panel { children, .. }
                | Node::Row { children, .. }
                | Node::Scroll { children, .. }
                | Node::Dial { children, .. } => walk(children, out),
                Node::X(b) => {
                    if b.inp.is_some() {
                        out.insert(format!("x{}", b.id));
                    }
                    walk(&b.c, out);
                }
                _ => {}
            }
        }
    }
    let mut out = std::collections::HashSet::new();
    walk(nodes, &mut out);
    out
}

/// Creates a `TextEdit` for each `Field` id not already present, seeded with the
/// spec's initial `text`. Existing edits (live text) are never overwritten.
pub fn collect_fields(nodes: &[Node], edits: &mut std::collections::HashMap<String, rune::TextEdit>) {
    for n in nodes {
        match n {
            Node::Field { id, text, .. } => {
                edits
                    .entry(id.clone())
                    .or_insert_with(|| rune::TextEdit::new(text.clone().unwrap_or_default()));
            }
            Node::Panel { children, .. }
            | Node::Row { children, .. }
            | Node::Scroll { children, .. }
            | Node::Dial { children, .. } => collect_fields(children, edits),
            _ => {}
        }
    }
}
