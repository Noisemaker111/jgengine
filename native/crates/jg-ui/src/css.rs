//! The generic CSS box: one element that carries a resolved CSS style (layout,
//! paint, text) as numbers. The TypeScript side resolves every style to this
//! record; here it becomes a Taffy style plus Rune paint, with no knowledge of
//! selectors, classes or units.

use std::cell::RefCell;
use std::collections::HashMap;

use rune::tok::{Family, TextStyle};
use rune::{Align, Color, El, ScrollSpec, Shadow, Span, TextEdit, Tx, col, el, text, text_input};
use rune_taffy::prelude::{
    AlignContent, AlignItems, AlignSelf, BoxSizing, Dimension, Display, FlexDirection, FlexWrap, GridAutoFlow, GridPlacement, GridTemplateComponent,
    JustifyContent, LengthPercentage, LengthPercentageAuto, Line, MaxTrackSizingFunction, MinTrackSizingFunction, Position, Rect, Size, Style,
    TrackSizingFunction, auto, length, line, percent, span,
};
use serde::Deserialize;

use crate::Ui;

/// A CSS length: points, a percentage, or `auto`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Dim {
    Px(f32),
    Pct(f32),
    Auto,
}

impl<'de> Deserialize<'de> for Dim {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Raw {
            N(f32),
            S(String),
        }
        Ok(match Raw::deserialize(d)? {
            Raw::N(v) => Dim::Px(v),
            Raw::S(s) => match s.strip_suffix('%').and_then(|p| p.parse::<f32>().ok()) {
                Some(p) => Dim::Pct(p / 100.0),
                None => Dim::Auto,
            },
        })
    }
}

impl Dim {
    fn dimension(self) -> Dimension {
        match self {
            Dim::Px(v) => Dimension::length(v),
            Dim::Pct(p) => Dimension::percent(p),
            Dim::Auto => Dimension::auto(),
        }
    }
    fn lpa(self) -> LengthPercentageAuto {
        match self {
            Dim::Px(v) => length(v),
            Dim::Pct(p) => percent(p),
            Dim::Auto => auto(),
        }
    }
    fn lp(self) -> LengthPercentage {
        match self {
            Dim::Px(v) => length(v),
            Dim::Pct(p) => percent(p),
            Dim::Auto => length(0.0),
        }
    }
}

/// `0xRRGGBBAA` in sRGB, parsed once into a Rune colour.
#[derive(Clone, Copy, Debug)]
pub struct Rgba(pub Color);

impl<'de> Deserialize<'de> for Rgba {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = f64::deserialize(d)? as u32;
        Ok(Rgba(rune::color::hex(&format!("#{v:08x}")).unwrap_or(Color::BLACK)))
    }
}

/// How big a radial gradient is before the box size is known.
#[derive(Deserialize, Clone, Debug)]
#[serde(untagged)]
pub enum RadialSize {
    /// Radii as fractions of the box's width and height.
    Fraction([f32; 2]),
    /// `"corner"` (farthest corner) or `"side"` (closest side).
    Keyword(String),
}

/// One background layer, bottom to top.
#[derive(Deserialize, Clone, Debug)]
pub struct Layer {
    /// A flat colour sheet instead of a gradient.
    #[serde(default)]
    pub flat: Option<Rgba>,
    #[serde(default)]
    pub rf: Option<RadialSize>,
    #[serde(default)]
    pub circle: bool,
    /// 0 linear, 1 radial.
    #[serde(default)]
    pub g: u8,
    /// Linear: CSS angle in radians.
    #[serde(default)]
    pub a: f32,
    /// Radial: centre in 0..1 of the box, radii in points.
    #[serde(default)]
    pub cx: f32,
    #[serde(default)]
    pub cy: f32,
    #[serde(default)]
    pub rx: f32,
    #[serde(default)]
    pub ry: f32,
    #[serde(default)]
    pub st: Vec<(f32, Rgba)>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct SpanW {
    pub a: u32,
    pub b: u32,
    #[serde(default)]
    pub c: Option<Rgba>,
    #[serde(default)]
    pub w: Option<f32>,
    #[serde(default)]
    pub z: Option<f32>,
    #[serde(default)]
    pub i: bool,
    #[serde(default)]
    pub bg: Option<Rgba>,
    #[serde(default)]
    pub u: bool,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Txt {
    pub s: String,
    #[serde(default)]
    pub sp: Vec<SpanW>,
    /// CSS family list.
    #[serde(default)]
    pub f: String,
    pub z: f32,
    #[serde(default = "normal_weight")]
    pub w: f32,
    #[serde(default)]
    pub i: bool,
    /// Line height in points (0: the font's).
    #[serde(default)]
    pub lh: f32,
    #[serde(default)]
    pub ls: f32,
    pub c: Rgba,
    /// 0 start, 1 centre, 2 end.
    #[serde(default)]
    pub al: u8,
    /// 0 wrap, 1 one line, 2 one line cut with an ellipsis.
    #[serde(default)]
    pub wr: u8,
    /// Shadows as `[x, y, blur, colour]`.
    #[serde(default)]
    pub ts: Vec<(f32, f32, f32, Rgba)>,
}

fn normal_weight() -> f32 {
    400.0
}

#[derive(Deserialize, Clone, Debug)]
pub struct Input {
    #[serde(default)]
    pub v: String,
    #[serde(default)]
    pub ph: String,
    #[serde(default)]
    pub phc: Option<Rgba>,
    #[serde(default)]
    pub multi: bool,
    #[serde(default)]
    pub secret: bool,
    #[serde(default)]
    pub off: bool,
    /// Bumped by the page when it sets the value itself; the field then takes `v`.
    #[serde(default)]
    pub rev: u32,
}

/// A grid track as `[min kind, min value, max kind, max value]`; kinds: 0 auto, 1 points,
/// 2 percent, 3 fr, 4 min-content, 5 max-content.
pub type Track = [f32; 4];

#[derive(Deserialize, Default)]
pub struct Box_ {
    #[serde(default)]
    pub id: u32,
    #[serde(default)]
    pub c: Vec<crate::Node>,
    /// 0 flex, 1 block, 2 grid, 3 none.
    #[serde(default)]
    pub d: u8,
    /// 0 row, 1 column, 2 row-reverse, 3 column-reverse.
    #[serde(default)]
    pub fd: u8,
    /// 0 nowrap, 1 wrap, 2 wrap-reverse.
    #[serde(default)]
    pub fw: u8,
    /// Alignment keywords: 1 start, 2 end, 3 centre, 4 stretch, 5 baseline, 6 between, 7 around, 8 evenly.
    #[serde(default)]
    pub ai: u8,
    #[serde(default)]
    pub ji: u8,
    #[serde(default)]
    pub asf: u8,
    #[serde(default)]
    pub jsf: u8,
    #[serde(default)]
    pub ac: u8,
    #[serde(default)]
    pub jc: u8,
    /// 0 static, 1 relative, 2 absolute.
    #[serde(default)]
    pub pos: u8,
    /// left, top, right, bottom.
    #[serde(default)]
    pub ins: Option<[Dim; 4]>,
    #[serde(default)]
    pub w: Option<Dim>,
    #[serde(default)]
    pub h: Option<Dim>,
    #[serde(default)]
    pub mnw: Option<Dim>,
    #[serde(default)]
    pub mnh: Option<Dim>,
    #[serde(default)]
    pub mxw: Option<Dim>,
    #[serde(default)]
    pub mxh: Option<Dim>,
    /// left, top, right, bottom.
    #[serde(default)]
    pub mg: Option<[Dim; 4]>,
    #[serde(default)]
    pub pd: Option<[Dim; 4]>,
    /// Border widths: top, right, bottom, left.
    #[serde(default)]
    pub bw: Option<[f32; 4]>,
    #[serde(default)]
    pub bc: Option<Rgba>,
    /// column gap, row gap.
    #[serde(default)]
    pub gap: Option<[f32; 2]>,
    #[serde(default)]
    pub fg: f32,
    #[serde(default = "one")]
    pub fs: f32,
    #[serde(default)]
    pub fb: Option<Dim>,
    #[serde(default)]
    pub ar: Option<f32>,
    #[serde(default)]
    pub gtc: Vec<Track>,
    #[serde(default)]
    pub gtr: Vec<Track>,
    #[serde(default)]
    pub gac: Vec<Track>,
    #[serde(default)]
    pub gar: Vec<Track>,
    /// 0 row, 1 column, 2 row dense, 3 column dense.
    #[serde(default)]
    pub gaf: u8,
    /// Placement as `[start kind, start, end kind, end]`; kinds: 0 auto, 1 line, 2 span.
    #[serde(default)]
    pub gc: Option<[i16; 4]>,
    #[serde(default)]
    pub gr: Option<[i16; 4]>,
    /// 0 visible, 1 clipped, 2 scrolls.
    #[serde(default)]
    pub ovx: u8,
    #[serde(default)]
    pub ovy: u8,
    #[serde(default)]
    pub bg: Option<Rgba>,
    #[serde(default)]
    pub ly: Vec<Layer>,
    /// Corner radii: top-left, top-right, bottom-right, bottom-left.
    #[serde(default)]
    pub rad: Option<[f32; 4]>,
    /// Shadows as `[x, y, blur, spread, inset]` with a colour.
    #[serde(default)]
    pub sh: Vec<([f32; 5], Rgba)>,
    #[serde(default)]
    pub op: Option<f32>,
    /// Translate x, y in points; rotation in radians; uniform scale; translate x, y as
    /// fractions of the box's own size.
    #[serde(default)]
    pub tf: Option<[f32; 6]>,
    /// 1: `box-sizing: content-box`.
    #[serde(default)]
    pub cb: u8,
    /// Border dashes: 1 dotted, 2 dashed.
    #[serde(default)]
    pub dash: u8,
    /// Backdrop blur radius in points.
    #[serde(default)]
    pub bblur: f32,
    /// Transform origin in units of the box.
    #[serde(default)]
    pub to: Option<[f32; 2]>,
    #[serde(default)]
    pub blur: f32,
    #[serde(default)]
    pub t: Option<Txt>,
    #[serde(default)]
    pub inp: Option<Input>,
    /// Inline SVG markup drawn to fill the box.
    #[serde(default)]
    pub svg: Option<String>,
    /// An image URL drawn to fill the box.
    #[serde(default)]
    pub img: Option<String>,
    /// How the image fills the box: 0 stretched, 1 covering (cropped), 2 contained.
    #[serde(default)]
    pub fit: u8,
    /// Pointer interest: bit 0 takes presses, bit 1 reports hover, bit 2 blocks the game underneath.
    #[serde(default)]
    pub hit: u8,
}

fn one() -> f32 {
    1.0
}

thread_local! {
    static FAMILIES: RefCell<HashMap<String, &'static str>> = RefCell::new(HashMap::new());
}

/// Rune names families by `&'static str`; each distinct CSS family list is kept once.
fn family(list: &str) -> Family {
    if list.is_empty() {
        return Family::Sans;
    }
    FAMILIES.with(|f| {
        let mut f = f.borrow_mut();
        if let Some(name) = f.get(list) {
            return Family::Named(name);
        }
        let leaked: &'static str = Box::leak(list.to_string().into_boxed_str());
        f.insert(list.to_string(), leaked);
        Family::Named(leaked)
    })
}

fn align_items(v: u8) -> Option<AlignItems> {
    Some(match v {
        1 => AlignItems::FLEX_START,
        2 => AlignItems::FLEX_END,
        3 => AlignItems::CENTER,
        4 => AlignItems::STRETCH,
        5 => AlignItems::BASELINE,
        _ => return None,
    })
}

fn align_content(v: u8) -> Option<AlignContent> {
    Some(match v {
        1 => AlignContent::FLEX_START,
        2 => AlignContent::FLEX_END,
        3 => AlignContent::CENTER,
        4 => AlignContent::STRETCH,
        6 => AlignContent::SPACE_BETWEEN,
        7 => AlignContent::SPACE_AROUND,
        8 => AlignContent::SPACE_EVENLY,
        _ => return None,
    })
}

fn track(t: &Track) -> TrackSizingFunction {
    let min = match t[0] as u8 {
        1 => MinTrackSizingFunction::length(t[1]),
        2 => MinTrackSizingFunction::percent(t[1] / 100.0),
        4 => MinTrackSizingFunction::min_content(),
        5 => MinTrackSizingFunction::max_content(),
        _ => MinTrackSizingFunction::auto(),
    };
    let max = match t[2] as u8 {
        1 => MaxTrackSizingFunction::length(t[3]),
        2 => MaxTrackSizingFunction::percent(t[3] / 100.0),
        3 => MaxTrackSizingFunction::fr(t[3]),
        4 => MaxTrackSizingFunction::min_content(),
        5 => MaxTrackSizingFunction::max_content(),
        _ => MaxTrackSizingFunction::auto(),
    };
    TrackSizingFunction { min, max }
}

fn placement(p: &[i16; 4]) -> Line<GridPlacement> {
    let one = |kind: i16, v: i16| -> GridPlacement {
        match kind {
            1 => line(v),
            2 => span(v.max(1) as u16),
            _ => GridPlacement::Auto,
        }
    };
    Line { start: one(p[0], p[1]), end: one(p[2], p[3]) }
}

fn rect4<T>(v: &[Dim; 4], f: impl Fn(Dim) -> T) -> Rect<T> {
    Rect { left: f(v[0]), top: f(v[1]), right: f(v[2]), bottom: f(v[3]) }
}

fn layout(b: &Box_, s: &mut Style) {
    s.display = match b.d {
        1 => Display::Block,
        2 => Display::Grid,
        3 => Display::None,
        _ => Display::Flex,
    };
    s.flex_direction = match b.fd {
        1 => FlexDirection::Column,
        2 => FlexDirection::RowReverse,
        3 => FlexDirection::ColumnReverse,
        _ => FlexDirection::Row,
    };
    s.flex_wrap = match b.fw {
        1 => FlexWrap::Wrap,
        2 => FlexWrap::WrapReverse,
        _ => FlexWrap::NoWrap,
    };
    s.align_items = align_items(b.ai).unwrap_or(AlignItems::NORMAL);
    s.justify_items = align_items(b.ji).unwrap_or(AlignItems::NORMAL);
    s.align_self = align_items(b.asf).map(|a| a as AlignSelf);
    s.justify_self = align_items(b.jsf).map(|a| a as AlignSelf);
    s.align_content = align_content(b.ac).unwrap_or(AlignContent::NORMAL);
    s.justify_content = align_content(b.jc).unwrap_or(JustifyContent::NORMAL);
    s.position = if b.pos == 2 { Position::Absolute } else { Position::Relative };
    if let Some(ins) = &b.ins {
        s.inset = rect4(ins, Dim::lpa);
    }
    s.size = Size { width: b.w.map_or(Dimension::auto(), Dim::dimension), height: b.h.map_or(Dimension::auto(), Dim::dimension) };
    s.min_size = Size { width: b.mnw.map_or(auto(), Dim::lpa), height: b.mnh.map_or(auto(), Dim::lpa) };
    s.max_size = Size { width: b.mxw.map_or(auto(), Dim::lpa), height: b.mxh.map_or(auto(), Dim::lpa) };
    if let Some(mg) = &b.mg {
        s.margin = rect4(mg, Dim::lpa);
    }
    if let Some(pd) = &b.pd {
        s.padding = rect4(pd, Dim::lp);
    }
    if let Some([t, r, bo, l]) = b.bw {
        s.border = Rect { left: length(l), top: length(t), right: length(r), bottom: length(bo) };
    }
    if let Some([c, r]) = b.gap {
        s.gap = Size { width: length(c), height: length(r) };
    }
    s.flex_grow = b.fg;
    s.flex_shrink = b.fs;
    s.flex_basis = b.fb.map_or(Dimension::auto(), Dim::dimension);
    s.aspect_ratio = b.ar;
    s.box_sizing = if b.cb == 1 { BoxSizing::ContentBox } else { BoxSizing::BorderBox };
    if b.d == 2 {
        s.grid_template_columns = b.gtc.iter().map(|t| GridTemplateComponent::Single(track(t))).collect();
        s.grid_template_rows = b.gtr.iter().map(|t| GridTemplateComponent::Single(track(t))).collect();
        s.grid_auto_columns = b.gac.iter().map(track).collect();
        s.grid_auto_rows = b.gar.iter().map(track).collect();
        s.grid_auto_flow = match b.gaf {
            1 => GridAutoFlow::Column,
            2 => GridAutoFlow::RowDense,
            3 => GridAutoFlow::ColumnDense,
            _ => GridAutoFlow::Row,
        };
    }
    if let Some(p) = &b.gc {
        s.grid_column = placement(p);
    }
    if let Some(p) = &b.gr {
        s.grid_row = placement(p);
    }
}

fn paint_layer(e: El, l: &Layer, size: [f32; 2]) -> El {
    if let Some(c) = l.flat {
        return e.fill(c.0);
    }
    let stops: Vec<(f32, Color)> = l.st.iter().map(|(t, c)| (*t, c.0)).collect();
    if l.g != 1 {
        return e.linear_gradient(l.a, stops);
    }
    let [w, h] = size;
    let (dx, dy) = (l.cx.max(1.0 - l.cx) * w, l.cy.max(1.0 - l.cy) * h);
    let mut radii = match &l.rf {
        Some(RadialSize::Fraction([fx, fy])) => [fx * w, fy * h],
        Some(RadialSize::Keyword(k)) if k == "side" => [l.cx.min(1.0 - l.cx) * w, l.cy.min(1.0 - l.cy) * h],
        // Farthest corner: an ellipse through it keeps the box's proportions.
        Some(RadialSize::Keyword(_)) => [dx * std::f32::consts::SQRT_2, dy * std::f32::consts::SQRT_2],
        None => [l.rx, l.ry],
    };
    if l.circle {
        let r = match &l.rf {
            Some(RadialSize::Keyword(k)) if k == "side" => radii[0].min(radii[1]),
            _ => dx.hypot(dy),
        };
        radii = [r, r];
    }
    e.radial_gradient([l.cx, l.cy], [radii[0].max(0.01), radii[1].max(0.01)], stops)
}

thread_local! {
    /// Each box's last laid-out rect `[x, y, w, h]` in window points, by id.
    pub static RECTS: RefCell<HashMap<u32, [f32; 4]>> = RefCell::new(HashMap::new());
    /// Set when a rect moved since the page last read them.
    pub static RECTS_DIRTY: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

fn size_of(id: u32) -> Option<[f32; 2]> {
    RECTS.with(|r| r.borrow().get(&id).map(|r| [r[2], r[3]]))
}

/// Whether this box's paint depends on its own laid-out size.
fn needs_size(b: &Box_) -> bool {
    b.ly.iter().any(|l| l.g == 1 && l.flat.is_none())
        || b.tf.is_some_and(|t| t[4] != 0.0 || t[5] != 0.0)
        || b.rad.is_some_and(|r| r.iter().any(|v| *v < 0.0))
        || b.svg.is_some()
        || b.img.is_some()
}

/// A full-size, out-of-flow sheet for one more background layer.
fn sheet(radii: Option<[f32; 4]>) -> El {
    let e = el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0));
    match radii {
        Some(r) => e.corners(r),
        None => e,
    }
}

fn text_style(t: &Txt) -> TextStyle {
    TextStyle { family: family(&t.f), line_height: t.lh, tracking: t.ls, italic: t.i, ..TextStyle::new(t.z, t.w) }
}

fn text_el(t: &Txt, color: Color) -> El {
    let mut e = text(t.s.clone()).font(text_style(t)).color(color);
    if !t.sp.is_empty() {
        let spans: Vec<Span> = t
            .sp
            .iter()
            .map(|s| {
                let mut span = Span::new(s.a as usize, s.b as usize);
                span.color = s.c.map(|c| c.0);
                span.weight = s.w;
                span.size = s.z;
                span.italic = s.i;
                span.bg = s.bg.map(|c| c.0);
                if s.u {
                    span.underline = Some(s.c.map_or(color, |c| c.0));
                }
                span
            })
            .collect();
        e = e.spans(spans);
    }
    e = e.align(match t.al {
        1 => Align::Center,
        2 => Align::End,
        _ => Align::Start,
    });
    match t.wr {
        1 => e.single_line(),
        2 => e.truncate(),
        _ => e.wrap(),
    }
}

/// Builds the Rune element for one CSS box and its subtree.
pub fn build(b: &Box_, path: &str, s: &Ui, t: &rune::tok::Theme) -> El {
    let key = if b.id == 0 { format!("t{path}") } else { format!("x{}", b.id) };
    let scrolls = b.ovx == 2 || b.ovy == 2;
    let sized = needs_size(b);
    let size = if sized { size_of(b.id).unwrap_or([0.0, 0.0]) } else { [0.0, 0.0] };
    let radii = b.rad.map(|r| r.map(|v| if v < 0.0 { -v * size[0].min(size[1]) } else { v }));
    let mut e = if let Some(inp) = &b.inp { input_el(b, inp, s) } else { el() };
    e = e.layout_style(|st| layout(b, st));
    if let Some(c) = b.bg {
        e = e.fill(c.0);
    }
    if let Some(r) = radii {
        e = e.corners(r);
    }
    if let (Some(w), Some(c)) = (b.bw, b.bc) {
        if w.iter().any(|v| *v > 0.0) {
            e = e.border_sides(w, c.0);
            if b.dash != 0 {
                let unit = w.iter().fold(0.0, |a: f32, v| a.max(*v));
                e = if b.dash == 1 { e.border_dash(unit, unit) } else { e.border_dash(unit * 3.0, unit * 2.0) };
            }
        }
    }
    if b.bblur > 0.0 {
        e = e.backdrop_blur(b.bblur * 0.5);
    }
    for (sh, c) in &b.sh {
        e = e.box_shadow(Shadow { x: sh[0], y: sh[1], blur: sh[2], spread: sh[3], color: c.0, inset: sh[4] > 0.5 });
    }
    if let Some(o) = b.op {
        e = e.opacity(o);
    }
    if let Some([tx, ty, rot, sc, fx, fy]) = b.tf {
        if let Some([ox, oy]) = b.to {
            e = e.origin(ox, oy);
        }
        e = e.offset(tx + fx * size[0], ty + fy * size[1]);
        if rot != 0.0 {
            e = e.rotate(rot);
        }
        if sc != 1.0 {
            e = e.scale(sc);
        }
    }
    if b.blur > 0.0 {
        e = e.blur(b.blur);
    }
    if b.ovx == 1 || b.ovy == 1 {
        e = e.clip_corners(radii.unwrap_or([0.0; 4]));
    }
    // The lowest gradient paints on the box itself; the rest are full-size sheets above it.
    let mut layers = b.ly.iter();
    if let Some(first) = layers.next() {
        e = if first.flat.is_some() && b.bg.is_some() {
            e.child(paint_layer(sheet(radii), first, size))
        } else {
            paint_layer(e, first, size)
        };
    }
    for l in layers {
        e = e.child(paint_layer(sheet(radii), l, size));
    }
    if let Some(svg) = &b.svg {
        let image = crate::widgets::image_of_svg(svg, size[0].max(size[1]).max(16.0));
        e = e.pixels_fit(image.pixels(), rune::SurfaceFit::Fit);
    } else if let Some(url) = &b.img {
        let image = crate::widgets::image_by_url(url, size[0].max(size[1]).max(32.0));
        e = match b.fit {
            1 => e.pixels_fit(image.pixels(), rune::SurfaceFit::Fill),
            2 => e.pixels_fit(image.pixels(), rune::SurfaceFit::Fit),
            _ => e.pixels(image.pixels()),
        };
    }
    if let Some(t) = &b.t {
        for (x, y, blur, c) in &t.ts {
            let mut shadow = text_el(t, c.0).pin(Some(*x), Some(*y), None, None).inert();
            if *blur > 0.0 {
                shadow = shadow.blur(blur * 0.5);
            }
            e = e.child(shadow);
        }
        e = e.child(text_el(t, t.c.0).layout_style(|st| {
            st.flex_grow = 1.0;
            st.flex_shrink = 1.0;
            st.min_size.width = length(0.0);
        }));
    }
    if scrolls {
        let mut inner = col().layout_style(|st| {
            layout(b, st);
            st.position = Position::Relative;
            st.inset = Rect { left: auto(), top: auto(), right: auto(), bottom: auto() };
            st.size = Size { width: Dimension::percent(1.0), height: Dimension::auto() };
            st.min_size = Size { width: auto(), height: auto() };
            st.max_size = Size { width: auto(), height: auto() };
            st.margin = Rect { left: length(0.0), top: length(0.0), right: length(0.0), bottom: length(0.0) };
            st.border = Rect { left: length(0.0), top: length(0.0), right: length(0.0), bottom: length(0.0) };
            st.flex_grow = 0.0;
            st.flex_shrink = 0.0;
            st.grid_column = Line { start: GridPlacement::Auto, end: GridPlacement::Auto };
            st.grid_row = Line { start: GridPlacement::Auto, end: GridPlacement::Auto };
        });
        for (i, ch) in b.c.iter().enumerate() {
            inner = inner.child(crate::build::build(ch, &format!("{path}.{i}"), s, t));
        }
        e = e
            .layout_style(|st| {
                st.display = Display::Flex;
                st.flex_direction = FlexDirection::Column;
                st.padding = Rect { left: length(0.0), top: length(0.0), right: length(0.0), bottom: length(0.0) };
            })
            .scroll(ScrollSpec { stick_bottom: false })
            .hit()
            .child(inner);
    } else {
        for (i, ch) in b.c.iter().enumerate() {
            e = e.child(crate::build::build(ch, &format!("{path}.{i}"), s, t));
        }
    }
    let id = b.id;
    if id != 0 {
        e = e.on_layout_tx(move |_: &mut Ui, rect: [f32; 4], tx: &mut Tx| {
            let grew = RECTS.with(|r| {
                let mut r = r.borrow_mut();
                let old = r.insert(id, rect);
                old.is_none_or(|o| (o[2] - rect[2]).abs() > 0.25 || (o[3] - rect[3]).abs() > 0.25)
            });
            RECTS_DIRTY.set(true);
            // Only a box whose paint follows its size needs the view built again.
            if !(sized && grew) {
                tx.live_only();
            }
        });
    }
    if b.hit & 1 != 0 {
        e = e.hit().on_press(move |_: &mut Ui| crate::emit_id(id, "click", None, None));
    } else if b.hit & 4 != 0 {
        e = e.hit();
    }
    if b.hit & 2 != 0 {
        e = e.hit().on_hover_change_any(move |over: bool, _tx: &mut Tx| crate::emit_id(id, if over { "enter" } else { "leave" }, None, None));
    }
    e.key(key)
}

fn input_el(b: &Box_, inp: &Input, s: &Ui) -> El {
    let key = format!("x{}", b.id);
    let edit = s.edits.get(key.as_str()).unwrap_or(&s.empty_edit);
    let style = b.t.as_ref().map_or_else(|| TextStyle::new(14.0, 400.0), text_style);
    let color = b.t.as_ref().map_or(Color::WHITE, |t| t.c.0);
    let mut e = text_input(edit, style).color(color).hit();
    if !inp.ph.is_empty() {
        e = e.placeholder(inp.ph.clone(), inp.phc.map_or(color.alpha(0.5), |c| c.0));
    }
    if !inp.multi {
        e = e.single_line();
    }
    if inp.secret {
        e = e.secure();
    }
    let edit_key = key.clone();
    let id = b.id;
    e.on_edit(move |s: &mut Ui| -> &mut TextEdit { s.edits.get_mut(edit_key.as_str()).unwrap_or(&mut s.empty_edit) })
        .on_submit(move |_: &mut Ui, _tx: &mut Tx| crate::emit_id(id, "submit", None, None))
}

/// The box with `id` anywhere under `nodes`.
pub fn find_mut(nodes: &mut [crate::Node], id: u32) -> Option<&mut Box_> {
    for n in nodes {
        if let crate::Node::X(b) = n {
            if b.id == id {
                return Some(b);
            }
            if let Some(found) = find_mut(&mut b.c, id) {
                return Some(found);
            }
        }
    }
    None
}

/// Field keys and their initial text across a tree, for the edit store.
pub fn fields<'a>(nodes: &'a [crate::Node], out: &mut Vec<(String, &'a Input)>) {
    for n in nodes {
        if let crate::Node::X(b) = n {
            if let Some(inp) = &b.inp {
                out.push((format!("x{}", b.id), inp));
            }
            fields(&b.c, out);
        }
    }
}
