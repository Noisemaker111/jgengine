//! Direct JSX elements. No CSS parser, browser style, or mirrored DOM participates.

use rune::{El, ScrollSpec, Shape, Spring, TextEdit, Tx, col, el, row, text_input};
use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};
use crate::{Ui, color, val, widgets};

/// Points of fade at a native scroll view's edge while content is hidden past it.
const SCROLL_FADE: f32 = 24.0;

#[derive(Deserialize, Serialize, Clone)]
#[serde(untagged)]
pub enum Size { Points(f32), Fraction { fraction: f32 } }

#[derive(Deserialize, Serialize, Clone)]
#[serde(untagged)]
pub enum Padding { All(f32), Sides([f32; 4]) }

#[derive(Deserialize, Serialize, Clone)]
pub struct Border { width: f32, color: String }
#[derive(Deserialize, Serialize, Clone)]
pub struct Shadow { y: f32, blur: f32, color: String, #[serde(default)] x: f32, #[serde(default)] spread: f32, #[serde(default)] inset: bool }
#[derive(Deserialize, Serialize, Clone)]
pub struct Gradient { angle: f32, stops: Vec<(f32, String)> }
#[derive(Deserialize, Serialize, Clone)]
pub struct Radial { center: [f32; 2], radius: [f32; 2], stops: Vec<(f32, String)> }
#[derive(Deserialize, Serialize, Clone)]
pub struct Motion { duration: f32, bounce: f32 }
#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Polygon { points: Vec<[f32; 2]>, view_box: [f32; 2] }
#[derive(Deserialize, Serialize, Clone)]
pub struct TextSlots { n: usize, u: Vec<usize> }

#[derive(Deserialize, Serialize, Clone)]
pub struct RichSpan {
    start: usize, end: usize,
    color: Option<String>, weight: Option<f32>, size: Option<f32>,
    #[serde(default)] mono: bool,
    #[serde(default)] italic: bool,
    underline: Option<String>,
}

#[derive(Deserialize, Serialize, Default, Clone)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Props {
    pub id: Option<String>,
    pub label: Option<String>,
    pub role: Option<String>,
    pub disabled: bool,
    hidden: bool,
    pub interactive: bool,
    pub focused: bool,
    columns: Option<usize>,
    x: Option<f32>,
    y: Option<f32>,
    scale: Option<f32>,
    x_slot: Option<usize>,
    y_slot: Option<usize>,
    scale_slot: Option<usize>,
    tooltip: Option<String>,
    drag: bool,
    fill: Option<String>,
    gradient: Option<Gradient>,
    radial: Option<Radial>,
    radius: Option<f32>,
    border: Option<Border>,
    shadow: Option<Shadow>,
    blur: Option<f32>,
    opacity: Option<f32>,
    opacity_slot: Option<usize>,
    width: Option<Size>,
    width_slot: Option<usize>,
    height: Option<Size>,
    height_slot: Option<usize>,
    min_width: Option<f32>,
    max_width: Option<f32>,
    min_height: Option<f32>,
    max_height: Option<f32>,
    padding: Option<Padding>,
    gap: Option<f32>,
    pin: Option<[Option<f32>; 4]>,
    grow: Option<f32>,
    shrink: Option<bool>,
    justify: Option<String>,
    items: Option<String>,
    clip: bool,
    hover: Option<String>,
    press: Option<String>,
    motion: Option<Motion>,
    shape: Option<Polygon>,
    size: Option<f32>,
    weight: Option<f32>,
    family: Option<String>,
    mono: bool,
    color: Option<String>,
    tracking: Option<f32>,
    align: Option<String>,
    text: Option<String>,
    spans: Option<Vec<RichSpan>>,
    text_slots: Option<TextSlots>,
    direction: Option<String>,
    scroll: bool,
    svg: Option<String>,
    image: Option<String>,
    fit: Option<String>,
    /// `field`: the page's text, taken whenever `rev` changes (and when the field first appears).
    pub value: Option<String>,
    pub placeholder: Option<String>,
    pub multiline: bool,
    pub secret: bool,
    pub rev: u32,
}

#[derive(Deserialize)]
pub struct Element {
    pub id: String,
    pub kind: String,
    pub props: Props,
    #[serde(default)]
    pub children: Vec<ElementNode>,
    #[serde(skip)]
    revision: u64,
}

#[derive(Deserialize)]
#[serde(tag = "k", rename_all = "lowercase")]
pub enum ElementNode { Native(Element) }

fn body(p: &Props) -> String {
    match &p.text_slots {
        Some(slots) => {
            let len = (val(slots.n).max(0.0) as usize).min(slots.u.len());
            String::from_utf16_lossy(&slots.u[..len].iter().map(|slot| val(*slot) as u16).collect::<Vec<_>>())
        }
        None => p.text.clone().unwrap_or_default(),
    }
}

pub fn build(node: &Element, s: &Ui) -> El {
    let revision = s.revision;
    // A field paints its live edit, which the memo hash cannot see.
    if node.kind == "field" { return field(node, s); }
    if !node.children.is_empty() { return build_element(node, s); }
    let p = &node.props;
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    revision.hash(&mut hash);
    node.revision.hash(&mut hash);
    for slot in [p.opacity_slot, p.width_slot, p.height_slot, p.x_slot, p.y_slot, p.scale_slot].into_iter().flatten() { val(slot).to_bits().hash(&mut hash); }
    if let Some(text) = &p.text_slots {
        val(text.n).to_bits().hash(&mut hash);
        for slot in &text.u { val(*slot).to_bits().hash(&mut hash); }
    }
    rune::memo::memo_with_hash(node.id.clone(), hash.finish(), || build_element(node, s))
}

fn build_element(node: &Element, s: &Ui) -> El {
    let p = &node.props;
    if p.hidden { return el().key(node.id.clone()).layout_style(|s| s.display = rune_taffy::prelude::Display::None); }
    let ink = p.color.as_deref().map(color).unwrap_or_else(|| color("#ede9d9"));
    let mut e = match node.kind.as_str() {
        "text" | "#text" => {
            let mut font = widgets::text_style(p.size.unwrap_or(14.0), p.weight.unwrap_or(400.0), p.mono);
            font.tracking = p.tracking.unwrap_or(0.0);
            if !p.mono { if let Some(family) = &p.family { font.family = native_family(family); } }
            let content = body(p);
            let spans = p.spans.as_ref().map(|spans| spans.iter().filter(|s| s.start < s.end && s.end <= content.len() && content.is_char_boundary(s.start) && content.is_char_boundary(s.end)).map(|s| {
                let mut span = rune::Span::new(s.start,s.end);
                span.weight = s.weight; span.size = s.size; span.mono = s.mono; span.italic = s.italic;
                span.color = s.color.as_deref().map(color); span.underline = s.underline.as_deref().map(color);
                span
            }).collect::<Vec<_>>()).unwrap_or_default();
            rune::rich(content, spans).font(font).color(ink).align(widgets::align_of(p.align.as_deref())).wrap()
        }
        "icon" => widgets::glyph(p.svg.as_deref().unwrap_or(""), p.size.unwrap_or(24.0), ink),
        _ => if p.direction.as_deref() == Some("row") { row() } else { col() },
    };
        if p.scroll {
            let mut inner = col().w_full().gap(p.gap.unwrap_or(0.0));
            for ElementNode::Native(child) in &node.children { inner = inner.child(build(child, s)); }
            // The fade marks an edge with more content past it; at rest the web's overlay scroll
            // bar is hidden, so without it a clipped list reads as complete.
            e = e.scroll(ScrollSpec { stick_bottom: false }).scroll_edge_fade(SCROLL_FADE).scroll_margin(SCROLL_FADE).hit().child(inner);
        } else {
            for ElementNode::Native(child) in &node.children { e = e.child(build(child, s)); }
        }
    e = apply(e, p);
    if p.interactive && !p.disabled {
        let id = node.id.clone();
        let hover_id = id.clone();
        if !p.drag { e = e.hit().on_press(move |_: &mut Ui| crate::emit(&id, "press", None, None)); }
        e = e.hit().on_hover_change(move |_: &mut Ui, inside, _| crate::emit(&hover_id, if inside { "hover" } else { "leave" }, None, None));
    }
    if p.drag && !p.disabled {
        let id = node.id.clone();
        e = e.hit().on_drag(move |_: &mut Ui, d: &mut rune::Drag, _: &mut rune::Tx| {
            crate::emit(&id, "drag", None, Some(serde_json::json!({
                "phase": match d.phase { rune::Phase::Down => "down", rune::Phase::Move => "move", rune::Phase::Up => "up" },
                "x": d.x, "y": d.y, "width": d.w, "height": d.h, "cancelled": d.cancelled()
            }).to_string()));
        });
    }
    if p.disabled { e = e.opacity(0.5); }
    if p.focused { e = e.border(2.0, color("#9cddd1")); }
    e.key(node.id.clone())
}

/// A Rune-owned text field. Its text lives in `Ui::edits` under the element id; edits, focus
/// changes and submits go back to the page as events (see the compositor).
fn field(node: &Element, s: &Ui) -> El {
    let p = &node.props;
    if p.hidden { return el().key(node.id.clone()).layout_style(|s| s.display = rune_taffy::prelude::Display::None); }
    let ink = p.color.as_deref().map(color).unwrap_or_else(|| color("#ede9d9"));
    let mut font = widgets::text_style(p.size.unwrap_or(16.0), p.weight.unwrap_or(400.0), p.mono);
    font.tracking = p.tracking.unwrap_or(0.0);
    if !p.mono { if let Some(family) = &p.family { font.family = native_family(family); } }
    let edit = s.edits.get(node.id.as_str()).unwrap_or(&s.empty_edit);
    let mut e = text_input(edit, font).color(ink).hit();
    if let Some(placeholder) = &p.placeholder { e = e.placeholder(placeholder.clone(), ink.alpha(0.5)); }
    if !p.multiline { e = e.single_line(); }
    if p.secret { e = e.secure(); }
    e = apply(e, p);
    if p.focused { e = e.border(2.0, color("#9cddd1")); }
    if p.disabled { return e.opacity(0.5).key(node.id.clone()); }
    let edit_id = node.id.clone();
    let submit_id = node.id.clone();
    e.on_edit(move |s: &mut Ui| -> &mut TextEdit { s.edits.get_mut(edit_id.as_str()).unwrap_or(&mut s.empty_edit) })
        .on_submit(move |s: &mut Ui, _: &mut Tx| {
            let text = s.edits.get(submit_id.as_str()).map(|edit| edit.text.clone());
            crate::emit(&submit_id, "submit", None, text);
        })
        .key(node.id.clone())
}

/// Every shown native `field` under `nodes`, by element id.
pub fn fields<'a>(nodes: &'a [crate::spec::Node], out: &mut Vec<(&'a str, &'a Props)>) {
    fn walk<'a>(node: &'a Element, out: &mut Vec<(&'a str, &'a Props)>) {
        if node.props.hidden { return; }
        if node.kind == "field" { out.push((node.id.as_str(), &node.props)); }
        for ElementNode::Native(child) in &node.children { walk(child, out); }
    }
    for node in nodes { if let crate::spec::Node::Native(element) = node { walk(element, out); } }
}

fn apply(mut e: El, p: &Props) -> El {
    if let Some(columns) = p.columns { e = e.equal_columns(columns.max(1)); }
    e = e.offset(p.x_slot.map(val).or(p.x).unwrap_or(0.0), p.y_slot.map(val).or(p.y).unwrap_or(0.0));
    if let Some(scale) = p.scale_slot.map(val).or(p.scale) { e = e.scale(scale); }
    if let Some(help) = &p.tooltip { e = e.help(help); }
    if let Some(shape) = &p.shape {
        let mut paint = Shape::new().view_box(shape.view_box[0], shape.view_box[1]);
        if let Some(fill) = &p.fill { paint = paint.fill(shape.points.clone(), color(fill)); }
        if let Some(border) = &p.border { paint = paint.stroke_with(shape.points.clone(), true, border.width, rune::LineCap::Butt, color(&border.color)); }
        e = e.shape(paint);
    } else {
        if let Some(fill) = &p.fill { e = e.fill(color(fill)); }
        if let Some(border) = &p.border { e = e.border(border.width, color(&border.color)); }
    }
    if let Some(g) = &p.gradient { e = e.linear_gradient(g.angle, g.stops.iter().map(|(t,c)| (*t,color(c))).collect::<Vec<_>>()); }
    if let Some(g) = &p.radial { e = e.radial_gradient(g.center, g.radius, g.stops.iter().map(|(t,c)| (*t,color(c))).collect::<Vec<_>>()); }
    if let Some(radius) = p.radius { e = e.radius(radius); }
    if let Some(shadow) = &p.shadow { e = e.box_shadow(rune::Shadow { x: shadow.x, y: shadow.y, blur: shadow.blur, spread: shadow.spread, inset: shadow.inset, color: color(&shadow.color) }); }
    if let Some(url) = &p.image {
        let image = widgets::image_by_url(url, p.max_width.unwrap_or(512.0));
        e = e.pixels_fit(image.pixels(), if p.fit.as_deref() == Some("contain") { rune::SurfaceFit::Fit } else { rune::SurfaceFit::Fill });
    }
    if let Some(blur) = p.blur { e = e.blur(blur); }
    if let Some(opacity) = p.opacity_slot.map(val).or(p.opacity) { e = e.opacity(opacity.clamp(0.0,1.0)); }
    match p.width_slot.map(|s| Size::Points(val(s))).or(p.width.clone()) {
        Some(Size::Points(v)) => e = e.w(v), Some(Size::Fraction { fraction }) => e = e.w_frac(fraction), None => {}
    }
    match p.height_slot.map(|s| Size::Points(val(s))).or(p.height.clone()) {
        Some(Size::Points(v)) => e = e.h(v), Some(Size::Fraction { fraction }) => e = e.layout_style(|s| { s.size.height = rune_taffy::prelude::percent(fraction); }), None => {}
    }
    if let Some(v) = p.min_width { e = e.min_w(v); }
    if let Some(v) = p.max_width { e = e.max_w(v); }
    if let Some(v) = p.min_height { e = e.min_h(v); }
    if let Some(v) = p.max_height { e = e.max_h(v); }
    if let Some(padding) = &p.padding {
        e = match padding { Padding::All(v) => e.padding(*v), Padding::Sides([t,r,b,l]) => e.pt(*t).pr(*r).pb(*b).pl(*l) };
    }
    if let Some(v) = p.gap { e = e.gap(v); }
    if let Some([l,t,r,b]) = p.pin { e = e.pin(l,t,r,b); }
    if let Some(v) = p.grow { e = e.grow(v); }
    if p.shrink == Some(true) { e = e.shrink(); }
    match p.justify.as_deref() { Some("center") => e = e.justify_center(), Some("end") => e = e.justify_end(), Some("between") => e = e.justify_between(), Some("evenly") => e = e.justify_evenly(), _ => {} }
    match p.items.as_deref() { Some("start") => e = e.items_start(), Some("center") => e = e.items_center(), Some("end") => e = e.items_end(), Some("stretch") => e = e.items_stretch(), _ => {} }
    if p.clip { e = e.clip_rounded(p.radius.unwrap_or(0.0)); }
    if let Some(c) = &p.hover { e = e.hover(color(c)); }
    if let Some(c) = &p.press { e = e.press(color(c)); }
    if let Some(m) = &p.motion { e = e.motion(Spring::new(m.duration, m.bounce)); }
    e
}

fn native_family(name: &str) -> rune::tok::Family {
    thread_local! { static FAMILIES: std::cell::RefCell<std::collections::HashMap<String, &'static str>> = Default::default(); }
    rune::tok::Family::Named(FAMILIES.with(|families| *families.borrow_mut().entry(name.to_owned()).or_insert_with(|| Box::leak(name.to_owned().into_boxed_str()))))
}

#[derive(Deserialize)]
pub struct PropertyPatch { id: String, field: String, value: serde_json::Value }

pub fn patch(nodes: &mut [crate::spec::Node], patches: &[PropertyPatch]) -> Result<(), String> {
    fn prepare(node: &Element, patches: &[PropertyPatch], prepared: &mut std::collections::HashMap<String, Props>) -> Result<(), String> {
        let edits: Vec<_> = patches.iter().filter(|patch| patch.id == node.id).collect();
        if !edits.is_empty() {
            let mut props = serde_json::to_value(&node.props).map_err(|error| error.to_string())?;
            for edit in edits { props[&edit.field] = edit.value.clone(); }
            prepared.insert(node.id.clone(), serde_json::from_value(props).map_err(|error| error.to_string())?);
        }
        for ElementNode::Native(child) in &node.children { prepare(child, patches, prepared)?; }
        Ok(())
    }
    fn apply(node: &mut Element, prepared: &mut std::collections::HashMap<String, Props>) {
        if let Some(props) = prepared.remove(&node.id) { node.props = props; node.revision = node.revision.wrapping_add(1); }
        for ElementNode::Native(child) in &mut node.children { apply(child, prepared); }
    }
    let mut prepared = std::collections::HashMap::new();
    for node in nodes.iter() { if let crate::spec::Node::Native(element) = node { prepare(element, patches, &mut prepared)?; } }
    for edit in patches { if !prepared.contains_key(&edit.id) { return Err(format!("Native patch target missing: {}",edit.id)); } }
    for node in nodes { if let crate::spec::Node::Native(element) = node { apply(element, &mut prepared); } }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tree(json: &str) -> Vec<crate::spec::Node> { vec![crate::spec::Node::Native(serde_json::from_str(json).unwrap())] }

    #[test]
    fn native_patch_is_atomic_and_changes_only_the_addressed_revision() {
        let mut nodes = tree(r##"{"id":"parent","kind":"box","props":{},"children":[{"k":"native","id":"fill","kind":"box","props":{"fill":"#123456"}},{"k":"native","id":"sibling","kind":"box","props":{}}]}"##);
        let edits = serde_json::from_str::<Vec<PropertyPatch>>(r##"[{"id":"fill","field":"fill","value":"#abcdef"},{"id":"sibling","field":"className","value":"invalid"}]"##).unwrap();
        assert!(patch(&mut nodes,&edits).is_err());
        let crate::spec::Node::Native(parent) = &nodes[0] else { panic!() };
        let ElementNode::Native(fill) = &parent.children[0];
        assert_eq!(fill.revision,0); assert_eq!(fill.props.fill.as_deref(),Some("#123456"));
        patch(&mut nodes,&edits[..1]).unwrap();
        let crate::spec::Node::Native(parent) = &nodes[0] else { panic!() };
        let ElementNode::Native(fill) = &parent.children[0];
        let ElementNode::Native(sibling) = &parent.children[1];
        assert_eq!(fill.revision,1); assert_eq!(fill.props.fill.as_deref(),Some("#abcdef"));
        assert_eq!(parent.revision,0); assert_eq!(sibling.revision,0);
        let missing = serde_json::from_str::<Vec<PropertyPatch>>(r#"[{"id":"missing","field":"radius","value":5}]"#).unwrap();
        assert!(patch(&mut nodes,&missing).is_err());
    }

    #[test]
    fn native_ui_settles_without_commits_motion_or_wakes_and_a_leaf_patch_wakes_it() {
        let mut state = Ui::default();
        state.root = tree(r##"{"id":"fill","kind":"box","props":{"width":{"fraction":0.5},"height":10,"fill":"#123456"}}"##);
        let mut rt = rune::Runtime::new(state,crate::build::view,(200.0,100.0),rune::Env::new(true,1.0));
        rt.frame(0.0);
        for _ in 0..120 { rt.frame(1.0/60.0); }
        let commits = rt.stats.commits;
        let instance_count = rt.instances.len();
        for _ in 0..120 {
            assert!(!rt.frame(1.0/60.0),"idle native surface requested animation");
            assert_eq!(rt.stats.commits,commits);
            assert_eq!(rt.instances.len(),instance_count);
            assert_eq!(rt.wake_deadline(),None);
        }
        let edits = serde_json::from_str::<Vec<PropertyPatch>>(r##"[{"id":"fill","field":"width","value":{"fraction":0.75}}]"##).unwrap();
        rt.update(|s,_| patch(&mut s.root,&edits).unwrap());
        rt.frame(0.0);
        assert!(rt.stats.commits > commits);
        let bounds = rt.layout_rects().find(|(key,_)| *key == "fill").unwrap().1;
        assert_eq!(bounds[2],150.0);
        for _ in 0..120 { rt.frame(1.0/60.0); }
        assert!(!rt.frame(1.0/60.0));
    }

    #[test]
    fn start_alignment_preserves_the_heights_of_siblings() {
        let element: Element = serde_json::from_str(r#"{"id":"row","kind":"box","props":{"direction":"row","items":"start"},"children":[{"k":"native","id":"short","kind":"box","props":{"width":50},"children":[{"k":"native","id":"content","kind":"box","props":{"height":20}}]},{"k":"native","id":"tall","kind":"box","props":{"width":50,"height":100}}]}"#).unwrap();
        let mut state = Ui::default();
        state.root = vec![crate::spec::Node::Native(element)];
        let mut rt = rune::Runtime::new(state, crate::build::view, (200.0,200.0), rune::Env::new(true,1.0));
        rt.frame(0.0);
        let short = rt.layout_rects().find(|(key,_)| *key == "short").unwrap().1;
        assert_eq!(short[3],20.0);
    }

    #[test]
    fn native_drag_delivers_local_coordinates_and_release() {
        crate::EVENTS.with(|events| events.borrow_mut().clear());
        let element: Element = serde_json::from_str(r#"{"id":"volume","kind":"box","props":{"width":200,"height":28,"drag":true,"interactive":true}}"#).unwrap();
        let mut state = Ui::default();
        state.root = vec![crate::spec::Node::Native(element)];
        let mut rt = rune::Runtime::new(state, crate::build::view, (200.0,100.0), rune::Env::new(true,1.0));
        rt.frame(0.0);
        rt.pointer_down(40.0,14.0);
        rt.frame(0.0);
        rt.pointer_move(160.0,14.0);
        rt.frame(0.0);
        assert!(crate::EVENTS.with(|events| events.borrow().iter().any(|event| event.kind == "drag" && event.text.as_ref().is_some_and(|text| text.contains("move")))));
        rt.pointer_up(160.0,14.0);
        rt.frame(0.0);
        assert_eq!(crate::EVENTS.with(|events| events.borrow().iter().filter(|event| event.kind == "drag" && event.text.as_ref().is_some_and(|text| text.contains("up"))).count()),1);
        crate::EVENTS.with(|events| events.borrow_mut().clear());
    }

    fn field_tree(value: &str, rev: u32) -> Vec<crate::spec::Node> {
        tree(&format!(r#"{{"id":"box","kind":"box","props":{{}},"children":[{{"k":"native","id":"chat","kind":"field","props":{{"value":"{value}","rev":{rev},"placeholder":"Say something","width":200,"height":36}}}}]}}"#))
    }

    #[test]
    fn native_field_seeds_keeps_live_text_across_rebuilds_and_takes_a_new_rev() {
        let mut state = Ui::default();
        state.root = field_tree("hi", 0);
        crate::sync_fields(&mut state);
        assert_eq!(state.edits.get("chat").map(|e| e.text.as_str()), Some("hi"));
        state.edits.get_mut("chat").unwrap().text = "hi there".into();
        // A rebuild with the same rev (the page re-rendered for some other reason) keeps what was typed.
        state.root = field_tree("hi", 0);
        crate::sync_fields(&mut state);
        assert_eq!(state.edits.get("chat").map(|e| e.text.as_str()), Some("hi there"));
        // A new rev is the page replacing the text: clearing chat after a send.
        state.edits.get_mut("chat").unwrap().focused = true;
        state.root = field_tree("", 1);
        crate::sync_fields(&mut state);
        let edit = state.edits.get("chat").unwrap();
        assert_eq!(edit.text, "");
        assert!(edit.focused, "a page-side replacement keeps focus");
        // A removed field drops its edit.
        state.root = tree(r#"{"id":"box","kind":"box","props":{}}"#);
        crate::sync_fields(&mut state);
        assert!(state.edits.get("chat").is_none());
    }

    #[test]
    fn native_field_types_and_submits_its_text() {
        crate::EVENTS.with(|events| events.borrow_mut().clear());
        let mut state = Ui::default();
        state.root = field_tree("", 0);
        crate::sync_fields(&mut state);
        let mut rt = rune::Runtime::new(state, crate::build::view, (300.0,100.0), rune::Env::new(true,1.0));
        rt.frame(0.0);
        let rect = rt.layout_rects().find(|(key,_)| *key == "chat").unwrap().1;
        rt.pointer_down(rect[0] + 10.0, rect[1] + rect[3] / 2.0);
        rt.pointer_up(rect[0] + 10.0, rect[1] + rect[3] / 2.0);
        rt.frame(0.0);
        rt.key(rune::KeyEvent { key: rune::Key::Text("ok".into()), mods: Default::default() });
        rt.frame(0.0);
        assert_eq!(rt.state.edits.get("chat").map(|e| e.text.as_str()), Some("ok"));
        assert!(rt.state.edits.get("chat").unwrap().focused);
        rt.key(rune::KeyEvent { key: rune::Key::Enter, mods: Default::default() });
        rt.frame(0.0);
        assert!(crate::EVENTS.with(|events| events.borrow().iter().any(|event| event.id == "chat" && event.kind == "submit" && event.text.as_deref() == Some("ok"))));
        crate::EVENTS.with(|events| events.borrow_mut().clear());
    }

    #[test]
    fn native_props_reject_css_and_unknown_fields() {
        assert!(serde_json::from_str::<Props>(r##"{"fill":"#123456","padding":[1,2,3,4],"width":{"fraction":1}}"##).is_ok());
        for json in [r#"{"className":"panel"}"#, r#"{"style":"color:red"}"#, r#"{"padding":"12px"}"#] {
            assert!(serde_json::from_str::<Props>(json).is_err(), "{json}");
        }
    }
}
