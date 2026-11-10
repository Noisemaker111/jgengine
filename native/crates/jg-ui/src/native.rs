//! Direct JSX elements. No CSS parser, browser style, or mirrored DOM participates.

use rune::{El, ScrollSpec, Shape, Spring, col, el, row, text};
use serde::Deserialize;
use std::hash::{Hash, Hasher};
use crate::{Ui, color, val, set_val, widgets};

#[derive(Deserialize, Clone)]
#[serde(untagged)]
pub enum Size { Points(f32), Fraction { fraction: f32 } }

#[derive(Deserialize, Clone)]
#[serde(untagged)]
pub enum Padding { All(f32), Sides([f32; 4]) }

#[derive(Deserialize, Clone)]
pub struct Border { width: f32, color: String }
#[derive(Deserialize, Clone)]
pub struct Shadow { y: f32, blur: f32, color: String, #[serde(default)] x: f32, #[serde(default)] spread: f32, #[serde(default)] inset: bool }
#[derive(Deserialize, Clone)]
pub struct Gradient { angle: f32, stops: Vec<(f32, String)> }
#[derive(Deserialize, Clone)]
pub struct Radial { center: [f32; 2], radius: [f32; 2], stops: Vec<(f32, String)> }
#[derive(Deserialize, Clone)]
pub struct Motion { duration: f32, bounce: f32 }
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Polygon { points: Vec<[f32; 2]>, view_box: [f32; 2] }
#[derive(Deserialize, Clone)]
pub struct TextSlots { n: usize, u: Vec<usize> }

#[derive(Deserialize, Default, Clone)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Props {
    pub id: Option<String>,
    pub label: Option<String>,
    pub role: Option<String>,
    pub disabled: bool,
    pub interactive: bool,
    pub focused: bool,
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
    text_slots: Option<TextSlots>,
    direction: Option<String>,
    scroll: bool,
    svg: Option<String>,
    image: Option<String>,
    fit: Option<String>,
    value: Option<f32>,
    value_slot: Option<usize>,
    max: Option<f32>,
    count: Option<usize>,
    tone: Option<crate::spec::Tone>,
}

#[derive(Deserialize)]
pub struct Element {
    pub id: String,
    pub kind: String,
    pub props: Props,
    #[serde(default)]
    pub children: Vec<ElementNode>,
}

#[derive(Deserialize)]
#[serde(tag = "k", rename_all = "lowercase")]
pub enum ElementNode { Native(Element) }

fn value(p: &Props) -> f32 { p.value_slot.map(val).or(p.value).unwrap_or(0.0) }

fn body(p: &Props) -> String {
    match &p.text_slots {
        Some(slots) => {
            let len = (val(slots.n).max(0.0) as usize).min(slots.u.len());
            String::from_utf16_lossy(&slots.u[..len].iter().map(|slot| val(*slot) as u16).collect::<Vec<_>>())
        }
        None => p.text.clone().unwrap_or_default(),
    }
}

pub fn build(node: &Element, revision: u64) -> El {
    if !node.children.is_empty() { return build_element(node, revision); }
    let p = &node.props;
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    revision.hash(&mut hash);
    for slot in [p.value_slot, p.opacity_slot, p.width_slot, p.height_slot].into_iter().flatten() { val(slot).to_bits().hash(&mut hash); }
    if let Some(text) = &p.text_slots {
        val(text.n).to_bits().hash(&mut hash);
        for slot in &text.u { val(*slot).to_bits().hash(&mut hash); }
    }
    rune::memo::memo_with_hash(node.id.clone(), hash.finish(), || build_element(node, revision))
}

fn build_element(node: &Element, revision: u64) -> El {
    let p = &node.props;
    let ink = p.color.as_deref().map(color).unwrap_or_else(|| color("#ede9d9"));
    let v = value(p);
    let tone = p.tone.clone().unwrap_or(crate::spec::Tone { colors: ["#9cddd1".into(), "#e2bd6e".into(), "#ff6a52".into()], warn: 35.0, bad: 15.0 });
    let mut e = match node.kind.as_str() {
        "text" | "#text" => {
            let mut font = widgets::text_style(p.size.unwrap_or(14.0), p.weight.unwrap_or(400.0), p.mono);
            font.tracking = p.tracking.unwrap_or(0.0);
            if !p.mono { if let Some(family) = &p.family { font.family = native_family(family); } }
            text(body(p)).font(font).color(ink).align(widgets::align_of(p.align.as_deref())).wrap()
        }
        "icon" => widgets::glyph(p.svg.as_deref().unwrap_or(""), p.size.unwrap_or(24.0), ink),
        "cells" => widgets::cells(p.count.unwrap_or(10), p.size.unwrap_or(6.0), 12.0, p.gap.unwrap_or(2.0), v / p.max.unwrap_or(100.0).max(f32::EPSILON), &tone, v),
        "dial" => widgets::dial(p.size.unwrap_or(104.0), v / p.max.unwrap_or(100.0).max(f32::EPSILON), &tone, v, node.children.iter().map(|ElementNode::Native(child)| build(child, revision)).collect()),
        "slider" => slider(node),
        _ => if p.direction.as_deref() == Some("row") { row() } else { col() },
    };
    if node.kind != "dial" {
        if p.scroll {
            let mut inner = col().w_full().gap(p.gap.unwrap_or(0.0));
            for ElementNode::Native(child) in &node.children { inner = inner.child(build(child, revision)); }
            e = e.scroll(ScrollSpec { stick_bottom: false }).hit().child(inner);
        } else {
            for ElementNode::Native(child) in &node.children { e = e.child(build(child, revision)); }
        }
    }
    e = apply(e, p);
    if p.interactive && !p.disabled && node.kind != "slider" {
        let id = node.id.clone();
        let hover_id = id.clone();
        e = e.hit().on_press(move |_: &mut Ui| crate::emit(&id, "press", None, None))
            .on_hover(move |_: &mut Ui| crate::emit(&hover_id, "hover", None, None));
    }
    if p.disabled { e = e.opacity(0.5); }
    if p.focused { e = e.border(2.0, color("#9cddd1")); }
    e.key(node.id.clone())
}

fn apply(mut e: El, p: &Props) -> El {
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

fn slider(node: &Element) -> El {
    let p = &node.props;
    let fraction = value(p).clamp(0.0,1.0);
    let ink = p.color.as_deref().map(color).unwrap_or_else(|| color("#9cddd1"));
    let id = node.id.clone();
    let slot = p.value_slot;
    let mut e = el().h(28.0).w_full()
        .child(el().pin(Some(0.0),Some(11.0),Some(0.0),None).h(6.0).radius(3.0).fill(color("#354c50"))
            .child(el().h_full().w_frac(fraction).fill(ink)));
    if !p.disabled { e = e.hit().on_drag(move |_: &mut Ui, d: &mut rune::Drag, _: &mut rune::Tx| {
        let value = (d.x / d.w.max(1.0)).clamp(0.0,1.0);
        if let Some(slot) = slot { set_val(slot,value); }
        crate::emit(&id,"slider",Some(value),None);
        if matches!(d.phase, rune::Phase::Up) { crate::emit(&id,"commit",Some(value),None); }
    }); }
    e
}

fn native_family(name: &str) -> rune::tok::Family {
    thread_local! { static FAMILIES: std::cell::RefCell<std::collections::HashMap<String, &'static str>> = Default::default(); }
    rune::tok::Family::Named(FAMILIES.with(|families| *families.borrow_mut().entry(name.to_owned()).or_insert_with(|| Box::leak(name.to_owned().into_boxed_str()))))
}

#[cfg(test)]
mod tests {
    use super::*;
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
    fn slider_updates_during_drag_and_commits_once_on_release() {
        crate::EVENTS.with(|events| events.borrow_mut().clear());
        let element: Element = serde_json::from_str(r#"{"id":"volume","kind":"slider","props":{"value":0.2,"interactive":true}}"#).unwrap();
        let mut state = Ui::default();
        state.root = vec![crate::spec::Node::Native(element)];
        let mut rt = rune::Runtime::new(state, crate::build::view, (200.0,100.0), rune::Env::new(true,1.0));
        rt.frame(0.0);
        rt.pointer_down(40.0,14.0);
        rt.frame(0.0);
        assert!(crate::EVENTS.with(|events| events.borrow().iter().all(|event| event.kind != "commit")));
        rt.pointer_move(160.0,14.0);
        rt.frame(0.0);
        assert!(crate::EVENTS.with(|events| events.borrow().iter().any(|event| event.kind == "slider" && event.value.unwrap_or(0.0) > 0.7)));
        rt.pointer_up(160.0,14.0);
        rt.frame(0.0);
        assert_eq!(crate::EVENTS.with(|events| events.borrow().iter().filter(|event| event.kind == "commit").count()),1);
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
