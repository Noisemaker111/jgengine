//! The generic CSS box: one element that carries a resolved CSS style (layout,
//! paint, text) as numbers. The TypeScript side resolves every style to this
//! record; here it becomes a Taffy style plus Rune paint, with no knowledge of
//! selectors, classes or units.

use std::cell::RefCell;
use std::collections::HashMap;

use rune::tok::{Family, TextStyle};
use rune::{Align, Color, El, ScrollSpec, Shadow, Span, TextEdit, Tx, col, el, text, text_input};
use rune_taffy::prelude::{
    AlignContent, AlignItems, AlignSelf, BoxSizing, Dimension, Display, FlexDirection, FlexWrap, GridAutoFlow, GridPlacement, GridTemplateComponent, RepetitionCount,
    JustifyContent, LengthPercentage, LengthPercentageAuto, Line, MaxTrackSizingFunction, MinTrackSizingFunction, Position, Rect, Size, Style,
    TrackSizingFunction, auto, length, line, percent, repeat, span,
};
use serde::Deserialize;

use crate::Ui;

/// A CSS length: points, a percentage, `auto`, or a `calc()` / `min()` / `max()` of points and percentages.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Dim {
    Px(f32),
    Pct(f32),
    Auto,
    /// The address of a leaked `rune_taffy::Calc`.
    Calc(usize),
}

thread_local! {
    /// One leaked value per distinct calc, so a style that is rebuilt every pass adds nothing.
    static CALCS: RefCell<HashMap<[u32; 5], usize>> = RefCell::new(HashMap::new());
}

/// `[points, fraction]`, or `[points, fraction, other points, other fraction, mode]` with mode 1 `min()`, 2 `max()`, 3 `clamp()`.
fn calc_of(v: &[f32]) -> usize {
    let at = |i: usize| v.get(i).copied().unwrap_or(0.0);
    let mode = at(4) as u32;
    let key = [at(0).to_bits(), at(1).to_bits(), at(2).to_bits(), at(3).to_bits(), mode];
    CALCS.with(|c| {
        *c.borrow_mut().entry(key).or_insert_with(|| rune_taffy::Calc { px: at(0), fraction: at(1), other_px: at(2), other_fraction: at(3), mode }.leak() as usize)
    })
}

impl<'de> Deserialize<'de> for Dim {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Raw {
            N(f32),
            S(String),
            C(Vec<f32>),
        }
        Ok(match Raw::deserialize(d)? {
            Raw::N(v) => Dim::Px(v),
            Raw::C(v) => Dim::Calc(calc_of(&v)),
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
            Dim::Calc(p) => Dimension::calc(p as *const ()),
        }
    }
    fn lpa(self) -> LengthPercentageAuto {
        match self {
            Dim::Px(v) => length(v),
            Dim::Pct(p) => percent(p),
            Dim::Auto => auto(),
            Dim::Calc(p) => LengthPercentageAuto::calc(p as *const ()),
        }
    }
    fn lp(self) -> LengthPercentage {
        match self {
            Dim::Px(v) => length(v),
            Dim::Pct(p) => percent(p),
            Dim::Auto => length(0.0),
            Dim::Calc(p) => LengthPercentage::calc(p as *const ()),
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
    /// `background-size` of a layer drawn once: `[w points, w fraction, h points, h fraction]` of the box.
    #[serde(default)]
    pub bs: Option<[f32; 4]>,
    /// Its `background-position`: `[x points, x fraction, y points, y fraction]` of the room left over.
    #[serde(default)]
    pub bp: Option<[f32; 4]>,
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
/// 2 percent, 3 fr, 4 min-content, 5 max-content. A min kind with 10 or 20 added is a track of
/// `repeat(auto-fill, ...)` or `repeat(auto-fit, ...)`.
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
    /// Each side's own border colour, `[top, right, bottom, left]`, when they differ.
    #[serde(default)]
    pub bcs: Option<[Rgba; 4]>,
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
    /// Horizontal skew (the tangent of its angle): the box paints as a parallelogram.
    #[serde(default)]
    pub sk: f32,
    /// `clip-path` as a polygon: each corner `[x points, x fraction, y points, y fraction]` of the box.
    #[serde(default)]
    pub cp: Vec<[f32; 4]>,
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
    /// A background picture: drawn over the box's colour and gradients, without sizing the box.
    #[serde(default)]
    pub bgi: Option<String>,
    #[serde(default)]
    pub bfit: u8,
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

/// A track list as Taffy takes it: neighbouring tracks of one `repeat(auto-fill | auto-fit, ...)` become
/// one repetition, counted by the layout from the room there is.
fn template(tracks: &[Track]) -> Vec<GridTemplateComponent<String>> {
    let mut out: Vec<GridTemplateComponent<String>> = Vec::new();
    let mut run: (u8, Vec<TrackSizingFunction>) = (0, Vec::new());
    let mut close = |run: &mut (u8, Vec<TrackSizingFunction>), out: &mut Vec<GridTemplateComponent<String>>| {
        if run.1.is_empty() {
            return;
        }
        let count = if run.0 == 2 { RepetitionCount::AutoFit } else { RepetitionCount::AutoFill };
        out.push(repeat(count, std::mem::take(&mut run.1)));
    };
    for t in tracks {
        let auto = (t[0] as u8) / 10;
        if auto != run.0 {
            close(&mut run, &mut out);
            run.0 = auto;
        }
        if auto == 0 {
            out.push(GridTemplateComponent::Single(track(t)));
        } else {
            run.1.push(track(t));
        }
    }
    close(&mut run, &mut out);
    out
}

fn track(t: &Track) -> TrackSizingFunction {
    let min = match (t[0] as u8) % 10 {
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
        s.grid_template_columns = template(&b.gtc);
        s.grid_template_rows = template(&b.gtr);
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
    b.ly.iter().any(|l| (l.g == 1 && l.flat.is_none()) || l.bs.is_some())
        || b.tf.is_some_and(|t| t[4] != 0.0 || t[5] != 0.0)
        || b.rad.is_some_and(|r| r.iter().any(|v| *v < 0.0))
        || b.svg.is_some()
        || b.img.is_some()
        || b.bgi.is_some()
        || !b.cp.is_empty()
        || b.sk != 0.0
}

/// The part of `poly` on the inside of the line `n · p = d` (`keep_below`: where `n · p <= d`).
fn cut(poly: &[[f32; 2]], n: [f32; 2], d: f32, keep_below: bool) -> Vec<[f32; 2]> {
    let side = |p: [f32; 2]| {
        let v = n[0] * p[0] + n[1] * p[1] - d;
        if keep_below { -v } else { v }
    };
    let mut out = Vec::with_capacity(poly.len() + 2);
    for i in 0..poly.len() {
        let (a, b) = (poly[i], poly[(i + 1) % poly.len()]);
        let (sa, sb) = (side(a), side(b));
        if sa >= 0.0 {
            out.push(a);
        }
        if (sa >= 0.0) != (sb >= 0.0) {
            let t = sa / (sa - sb);
            out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
    }
    out
}

fn stop_color(stops: &[(f32, Color)], t: f32) -> Color {
    let Some(first) = stops.first() else { return Color { r: 0.0, g: 0.0, b: 0.0, a: 0.0 } };
    if t <= first.0 {
        return first.1;
    }
    for pair in stops.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        if t <= b.0 {
            let span = (b.0 - a.0).max(1e-6);
            return a.1.mix(b.1, ((t - a.0) / span).clamp(0.0, 1.0));
        }
    }
    stops.last().map_or(first.1, |s| s.1)
}

thread_local! {
    /// The `clip-path` polygons of the boxes being built around the current one, in window points.
    static CLIPS: RefCell<Vec<Vec<[f32; 2]>>> = const { RefCell::new(Vec::new()) };
}

fn area(poly: &[[f32; 2]]) -> f32 {
    let mut sum = 0.0;
    for i in 0..poly.len() {
        let (a, b) = (poly[i], poly[(i + 1) % poly.len()]);
        sum += a[0] * b[1] - b[0] * a[1];
    }
    (sum * 0.5).abs()
}

/// The polygon this box's background is cut to, in its own points: its own `clip-path`, or the
/// part of an enclosing box's that crosses it. `None` when nothing cuts it.
fn clip_of(b: &Box_, rect: Option<[f32; 4]>) -> Option<Vec<[f32; 2]>> {
    if !b.cp.is_empty() {
        let [w, h] = rect.map_or([0.0, 0.0], |r| [r[2], r[3]]);
        return Some(b.cp.iter().map(|p| [p[0] + p[1] * w, p[2] + p[3] * h]).collect());
    }
    if b.sk != 0.0 {
        let [w, h] = rect.map_or([0.0, 0.0], |r| [r[2], r[3]]);
        let k = b.sk * h * 0.5;
        return Some(vec![[-k, 0.0], [w - k, 0.0], [w + k, h], [k, h]]);
    }
    if b.bg.is_none() && b.ly.is_empty() {
        return None;
    }
    let outer = CLIPS.with(|c| c.borrow().last().cloned())?;
    let [x, y, w, h] = rect?;
    let mut piece: Vec<[f32; 2]> = outer.iter().map(|p| [p[0] - x, p[1] - y]).collect();
    for (n, d, below) in [([1.0, 0.0], 0.0, false), ([1.0, 0.0], w, true), ([0.0, 1.0], 0.0, false), ([0.0, 1.0], h, true)] {
        if piece.len() >= 3 {
            piece = cut(&piece, n, d, below);
        }
    }
    if piece.len() < 3 {
        return Some(Vec::new());
    }
    // The enclosing shape covers this box whole: it paints as it is.
    (area(&piece) < w * h - 0.5).then_some(piece)
}

/// How many bands a gradient inside a clipped box is painted in.
const BANDS: usize = 24;

/// A clipped box's background: `clip-path` cuts the box to a polygon, so its colour and gradients
/// are painted as fills of that polygon (a gradient as bands across it) instead of on the rect.
fn clipped_paint(b: &Box_, size: [f32; 2], poly: &[[f32; 2]]) -> rune::Shape {
    let [w, h] = size;
    let poly = poly.to_vec();
    let mut shape = rune::Shape::new();
    if w <= 0.0 || h <= 0.0 {
        return shape;
    }
    if let Some(c) = b.bg {
        if c.0.a > 0.0 && poly.len() >= 3 {
            shape = shape.fill(poly.clone(), c.0);
        }
    }
    if poly.len() < 3 {
        return shape;
    }
    for l in b.ly.iter().filter(|l| l.bs.is_none()) {
        if let Some(c) = l.flat {
            shape = shape.fill(poly.clone(), c.0);
            continue;
        }
        let stops: Vec<(f32, Color)> = l.st.iter().map(|(t, c)| (*t, c.0)).collect();
        if l.g == 1 {
            // A radial gradient inside a clipped box paints as its middle colour.
            let mid = stop_color(&stops, 0.5);
            if mid.a > 0.0 {
                shape = shape.fill(poly.clone(), mid);
            }
            continue;
        }
        let n = [l.a.sin(), -l.a.cos()];
        let length = (w * n[0]).abs() + (h * n[1]).abs();
        if length <= 0.0 {
            continue;
        }
        let start = n[0] * w * 0.5 + n[1] * h * 0.5 - length * 0.5;
        for band in 0..BANDS {
            let (t0, t1) = (band as f32 / BANDS as f32, (band + 1) as f32 / BANDS as f32);
            let color = stop_color(&stops, (t0 + t1) * 0.5);
            if color.a <= 0.0 {
                continue;
            }
            // Bands overlap by a hair so no seam shows between them; the ends run to the polygon's edge.
            let low = if band == 0 { f32::NEG_INFINITY } else { start + t0 * length - 0.25 };
            let high = if band + 1 == BANDS { f32::INFINITY } else { start + t1 * length + 0.25 };
            let mut piece = poly.clone();
            if low.is_finite() {
                piece = cut(&piece, n, low, false);
            }
            if high.is_finite() && piece.len() >= 3 {
                piece = cut(&piece, n, high, true);
            }
            if piece.len() >= 3 {
                shape = shape.fill(piece, color);
            }
        }
    }
    shape
}

/// The sheet one background layer paints on: the whole box, or the piece its size and position give.
fn layer_sheet(l: &Layer, radii: Option<[f32; 4]>, size: [f32; 2]) -> El {
    let Some(bs) = l.bs else { return paint_layer(sheet(radii), l, size) };
    let (w, h) = (bs[0] + bs[1] * size[0], bs[2] + bs[3] * size[1]);
    let bp = l.bp.unwrap_or([0.0; 4]);
    let (x, y) = (bp[0] + bp[1] * (size[0] - w), bp[2] + bp[3] * (size[1] - h));
    paint_layer(el().pin(Some(x), Some(y), None, None).size(w.max(0.0), h.max(0.0)), l, [w, h])
}

/// Corner radii that keep a picture inside a polygon cut from a box: none where the polygon reaches
/// the corner, and elsewhere wide enough that the arc stays inside a straight cut of that size.
fn cut_corners(poly: &[[f32; 2]], size: [f32; 2]) -> [f32; 4] {
    let [w, h] = size;
    [[0.0, 0.0], [w, 0.0], [w, h], [0.0, h]].map(|corner| {
        let nearest = poly.iter().map(|p| (p[0] - corner[0]).hypot(p[1] - corner[1])).fold(f32::INFINITY, f32::min);
        if nearest.is_finite() && nearest > 0.5 { (nearest * 1.71).min(w.min(h) * 0.5) } else { 0.0 }
    })
}

/// A full-size, out-of-flow sheet for one more background layer.
fn sheet(radii: Option<[f32; 4]>) -> El {
    let e = el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0));
    match radii {
        Some(r) => e.corners(r),
        None => e,
    }
}

/// The byte offset of the `units`-th UTF-16 code unit of `text` (its end when `units` runs past it).
fn byte_at(text: &str, units: usize) -> usize {
    let mut seen = 0;
    for (at, ch) in text.char_indices() {
        if seen >= units {
            return at;
        }
        seen += ch.len_utf16();
    }
    text.len()
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
                // The page counts in UTF-16 units; the text layout counts in bytes.
                let mut span = Span::new(byte_at(&t.s, s.a as usize), byte_at(&t.s, s.b as usize));
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
    let enclosed = CLIPS.with(|c| !c.borrow().is_empty());
    let sized = needs_size(b) || enclosed;
    let size = if sized { size_of(b.id).unwrap_or([0.0, 0.0]) } else { [0.0, 0.0] };
    let radii = b.rad.map(|r| r.map(|v| if v < 0.0 { -v * size[0].min(size[1]) } else { v }));
    let mut e = if let Some(inp) = &b.inp { input_el(b, inp, s) } else { el() };
    e = e.layout_style(|st| layout(b, st));
    let rect = RECTS.with(|r| r.borrow().get(&b.id).copied());
    let clip = clip_of(b, rect);
    let clipped = clip.is_some();
    let skewed = b.sk != 0.0 && b.cp.is_empty();
    if let Some(poly) = &clip {
        let mut shape = clipped_paint(b, size, poly);
        // A skewed box's border follows its slanted sides.
        if let (true, Some(w), Some(c)) = (skewed, b.bw, b.bc) {
            let width = w.iter().fold(0.0, |a: f32, v| a.max(*v));
            if width > 0.0 && poly.len() >= 3 {
                shape = shape.stroke_with(poly.clone(), true, width, rune::LineCap::Butt, c.0);
            }
        }
        e = e.shape(shape);
    } else if let Some(c) = b.bg {
        e = e.fill(c.0);
    }
    if let Some(r) = radii {
        e = e.corners(r);
    }
    if let (Some(w), Some(colors), false) = (b.bw, &b.bcs, skewed) {
        // One border per colour: the first on the box, each other on a sheet over it.
        let mut drawn = [false; 4];
        let mut first = true;
        for side in 0..4 {
            if drawn[side] || w[side] <= 0.0 {
                continue;
            }
            let color = colors[side].0;
            let mut widths = [0.0; 4];
            for other in side..4 {
                if !drawn[other] && colors[other].0 == color {
                    widths[other] = w[other];
                    drawn[other] = true;
                }
            }
            if color.a <= 0.0 {
                continue;
            }
            if first {
                e = e.border_sides(widths, color);
                first = false;
            } else {
                e = e.child(sheet(radii).border_sides(widths, color).inert());
            }
        }
    } else if let (Some(w), Some(c), false) = (b.bw, b.bc, skewed) {
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
    if clipped {
        // The polygon took the colour and the gradients that fill the box; pieces placed inside it
        // (rivets, corner marks) are drawn as they are.
        for l in b.ly.iter().filter(|l| l.bs.is_some()) {
            e = e.child(layer_sheet(l, radii, size));
        }
    }
    let mut layers = if clipped { [].iter() } else { b.ly.iter() };
    if let Some(first) = layers.next() {
        e = if (first.flat.is_some() && b.bg.is_some()) || first.bs.is_some() {
            e.child(layer_sheet(first, radii, size))
        } else {
            paint_layer(e, first, size)
        };
    }
    for l in layers {
        e = e.child(layer_sheet(l, radii, size));
    }
    if let Some(url) = &b.bgi {
        let image = crate::widgets::image_by_url(url, size[0].max(size[1]).max(32.0));
        let fit = match b.bfit {
            2 => rune::SurfaceFit::Fit,
            _ => rune::SurfaceFit::Fill,
        };
        // On a box with cut corners the picture is rounded off just inside each cut.
        let corners = match &clip {
            Some(poly) => Some(cut_corners(poly, size)),
            None => radii,
        };
        e = e.child(sheet(corners).pixels_fit(image.pixels(), fit).inert());
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
        let grow = |st: &mut Style| {
            st.flex_grow = 1.0;
            st.flex_shrink = 1.0;
            st.min_size.width = length(0.0);
        };
        if t.ts.is_empty() {
            e = e.child(text_el(t, t.c.0).layout_style(grow));
        } else {
            // Each shadow is the same text block moved over, inside one holder with the text, so it
            // has the text's width, wrapping and alignment wherever the box puts the text.
            let mut holder = col().layout_style(grow);
            for (x, y, blur, c) in &t.ts {
                let mut shadow = text_el(t, c.0).pin(Some(*x), Some(*y), Some(-*x), None).inert();
                if *blur > 0.0 {
                    shadow = shadow.blur(blur * 0.5);
                }
                holder = holder.child(shadow);
            }
            e = e.child(holder.child(text_el(t, t.c.0)));
        }
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
            // At least as tall as the box that scrolls it (so its children can fill that room), and
            // as tall as its content when that is more.
            st.flex_grow = 1.0;
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
        // Children's backgrounds are cut to this box's own shape.
        let own = (!b.cp.is_empty()).then_some(()).and(rect).zip(clip.as_ref()).map(|(r, poly)| poly.iter().map(|p| [p[0] + r[0], p[1] + r[1]]).collect::<Vec<_>>());
        let pushed = own.is_some();
        if let Some(poly) = own {
            CLIPS.with(|c| c.borrow_mut().push(poly));
        }
        for (i, ch) in b.c.iter().enumerate() {
            e = e.child(crate::build::build(ch, &format!("{path}.{i}"), s, t));
        }
        if pushed {
            CLIPS.with(|c| c.borrow_mut().pop());
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
    // The page hit-tests pointer input itself from the reported rects; here a hit box only
    // marks where the UI is, so input over it does not reach the game underneath.
    if b.hit != 0 {
        e = e.hit();
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
