//! The generic CSS box: one element that carries a resolved CSS style (layout,
//! paint, text) as numbers. The TypeScript side resolves every style to this
//! record; here it becomes a Taffy style plus Rune paint, with no knowledge of
//! selectors, classes or units.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use rune::tok::{Family, TextStyle};
use rune::{Align, Color, El, Shadow, Span, TextEdit, Tx, col, el, text, text_input};
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
    Slot { v: usize, p: bool },
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
            V { v: usize, #[serde(default)] p: bool },
        }
        Ok(match Raw::deserialize(d)? {
            Raw::N(v) => Dim::Px(v),
            Raw::C(v) => Dim::Calc(calc_of(&v)),
            Raw::V { v, p } => Dim::Slot { v, p },
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
            Dim::Slot { v, p } => if p { Dimension::percent(crate::val(v)) } else { Dimension::length(crate::val(v)) },
        }
    }
    fn lpa(self) -> LengthPercentageAuto {
        match self {
            Dim::Px(v) => length(v),
            Dim::Pct(p) => percent(p),
            Dim::Auto => auto(),
            Dim::Calc(p) => LengthPercentageAuto::calc(p as *const ()),
            Dim::Slot { v, p } => if p { percent(crate::val(v)) } else { length(crate::val(v)) },
        }
    }
    fn lp(self) -> LengthPercentage {
        match self {
            Dim::Px(v) => length(v),
            Dim::Pct(p) => percent(p),
            Dim::Auto => length(0.0),
            Dim::Calc(p) => LengthPercentage::calc(p as *const ()),
            Dim::Slot { v, p } => if p { percent(crate::val(v)) } else { length(crate::val(v)) },
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
    #[serde(default)]
    pub img: Option<String>,
    #[serde(default)]
    pub fit: u8,
    #[serde(default)]
    pub blend: u8,
    /// A flat colour sheet instead of a gradient.
    #[serde(default)]
    pub flat: Option<Rgba>,
    #[serde(default)]
    pub rf: Option<RadialSize>,
    #[serde(default)]
    pub circle: bool,
    /// 0 linear, 1 radial, 2 conic.
    #[serde(default)]
    pub g: u8,
    /// Linear: CSS angle in radians. Conic: where the turn starts, in radians from the top.
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
    #[serde(default)]
    pub ps: bool,
    #[serde(default)]
    pub rp: Option<[bool; 2]>,
    /// A repeating linear gradient: one repeat's length in points (stops are fractions of it) and
    /// where the first repeat starts along the gradient line.
    #[serde(default)]
    pub per: f32,
    #[serde(default)]
    pub off: f32,
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
    pub f: Option<String>,
    #[serde(default)]
    pub z: Option<f32>,
    #[serde(default)]
    pub i: bool,
    #[serde(default)]
    pub bg: Option<Rgba>,
    #[serde(default)]
    pub u: bool,
    #[serde(default)]
    pub uc: Option<Rgba>,
    #[serde(default)]
    pub ut: Option<f32>,
    #[serde(default)]
    pub uo: Option<f32>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct LiveText {
    pub n: usize,
    pub u: Vec<usize>,
}

impl LiveText {
    fn read(&self) -> String {
        let count = (crate::val(self.n).max(0.0) as usize).min(self.u.len());
        let units: Vec<u16> = self.u[..count].iter().map(|slot| crate::val(*slot) as u16).collect();
        String::from_utf16_lossy(&units)
    }
}

#[derive(Deserialize, Clone, Debug)]
pub struct Txt {
    pub s: String,
    #[serde(default)]
    pub live: Option<LiveText>,
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
pub struct Filter {
    pub kind: u8,
    #[serde(default)]
    pub n: f32,
    #[serde(default)]
    pub sh: Option<(f32, f32, f32, Rgba)>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Input {
    #[serde(default)]
    pub cols: usize,
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
    pub island: u8,
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
    /// An auto-width wrapping row whose containing layout shrink-wraps its inline size.
    #[serde(default)]
    pub fitw: u8,
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
    #[serde(default)]
    pub z: i32,
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
    /// Bit per top/right/bottom/left side whose border has two strokes.
    #[serde(default)]
    pub dbl: u8,
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
    #[serde(default)]
    pub opv: Option<usize>,
    /// Round mask holes: centre x points/fraction, centre y points/fraction, inner/outer radii.
    #[serde(default)]
    pub holes: Vec<[f32; 6]>,
    /// Linear mask fades: point/fraction pairs for left, top, right, bottom.
    #[serde(default)]
    pub fade: Option<[f32; 8]>,
    #[serde(default)]
    pub mask: Vec<Layer>,
    #[serde(default)]
    pub bgtext: bool,
    /// Translate x, y in points; rotation in radians; uniform scale; translate x, y as
    /// fractions of the box's own size.
    #[serde(default)]
    pub tf: Option<[f32; 6]>,
    #[serde(default)]
    pub tfv: Option<[usize; 6]>,
    /// 1: `box-sizing: content-box`.
    #[serde(default)]
    pub cb: u8,
    /// Border dashes: 1 dotted, 2 dashed.
    #[serde(default)]
    pub dash: u8,
    /// An outline: `[width, offset, dashes]` (dashes as `dash`), in `olc`.
    #[serde(default)]
    pub ol: Option<[f32; 3]>,
    #[serde(default)]
    pub olc: Option<Rgba>,
    /// Backdrop blur radius in points.
    #[serde(default)]
    pub bblur: f32,
    #[serde(default)]
    pub bgblend: u8,
    #[serde(default)]
    pub blend: u8,
    #[serde(default)]
    pub isolate: bool,
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
    pub fx: Vec<Filter>,
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

/// A track list as Taffy takes it: neighbouring tracks of one `repeat(auto-fill | auto-fit, ...)` become
/// one repetition, counted by the layout from the room there is.
fn template(tracks: &[Track]) -> Vec<GridTemplateComponent<String>> {
    let mut out: Vec<GridTemplateComponent<String>> = Vec::new();
    let mut run: (u8, Vec<TrackSizingFunction>) = (0, Vec::new());
    let close = |run: &mut (u8, Vec<TrackSizingFunction>), out: &mut Vec<GridTemplateComponent<String>>| {
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
    if b.w.is_none() && b.fitw != 0 {
        s.size.width = Dimension::fit_content_percent(1.0);
    }
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

/// The dashes of a border `[top, right, bottom, left]` wide, each side on its own: three widths on
/// and two off for dashed, one and one for dotted.
fn dashes_shape(widths: [f32; 4], color: Color, dash: u8, size: [f32; 2]) -> rune::Shape {
    let [w, h] = size;
    let mut shape = rune::Shape::new();
    for (side, width) in widths.into_iter().enumerate() {
        if width <= 0.0 {
            continue;
        }
        let (on, off) = if dash == 1 { (width, width) } else { (width * 3.0, width * 2.0) };
        let along = if side % 2 == 0 { w } else { h };
        let mut at = 0.0;
        while at < along {
            let end = (at + on).min(along);
            let rect = match side {
                0 => [[at, 0.0], [end, 0.0], [end, width], [at, width]],
                1 => [[w - width, at], [w, at], [w, end], [w - width, end]],
                2 => [[at, h - width], [end, h - width], [end, h], [at, h]],
                _ => [[0.0, at], [width, at], [width, end], [0.0, end]],
            };
            shape = shape.fill(rect.to_vec(), color);
            at += on + off;
        }
    }
    shape
}

/// A repeating linear gradient as bands across the box, one per pair of stops in each repeat
/// (hazard stripes, tape, ruled paper). A band between two colours is drawn in four steps.
fn stripes_shape(l: &Layer, size: [f32; 2]) -> rune::Shape {
    let [w, h] = size;
    stripes(rune::Shape::new(), l, size, &[[0.0, 0.0], [w, 0.0], [w, h], [0.0, h]])
}

/// The bands of `stripes_shape`, cut to `poly` and added to `shape`.
fn stripes(mut shape: rune::Shape, l: &Layer, size: [f32; 2], poly: &[[f32; 2]]) -> rune::Shape {
    let [w, h] = size;
    if w <= 0.0 || h <= 0.0 || l.st.len() < 2 {
        return shape;
    }
    let stops: Vec<(f32, Color)> = l.st.iter().map(|(t, c)| (*t, c.0)).collect();
    let n = [l.a.sin(), -l.a.cos()];
    let length = (w * n[0]).abs() + (h * n[1]).abs();
    let repeats = (length / l.per).ceil() as i32 + 1;
    if length <= 0.0 || repeats > 240 {
        let mid = stop_color(&stops, 0.5);
        return if mid.a > 0.0 { shape.fill(poly.to_vec(), mid) } else { shape };
    }
    let start = n[0] * w * 0.5 + n[1] * h * 0.5 - length * 0.5 + l.off;
    let first = -(l.off / l.per).ceil() as i32;
    for k in first..repeats {
        let base = start + k as f32 * l.per;
        for pair in stops.windows(2) {
            let (a, b) = (pair[0], pair[1]);
            if b.0 - a.0 <= 1e-5 {
                continue;
            }
            let steps = if a.1 == b.1 { 1 } else { 4 };
            for step in 0..steps {
                let (t0, t1) = (a.0 + (b.0 - a.0) * step as f32 / steps as f32, a.0 + (b.0 - a.0) * (step + 1) as f32 / steps as f32);
                let color = stop_color(&stops, (t0 + t1) * 0.5);
                if color.a <= 0.0 {
                    continue;
                }
                let lap = if color.a >= 1.0 { 0.2 } else { 0.0 };
                let mut piece = cut(poly, n, base + t0 * l.per - lap, false);
                if piece.len() >= 3 {
                    piece = cut(&piece, n, base + t1 * l.per + lap, true);
                }
                if piece.len() >= 3 {
                    shape = shape.fill(piece, color);
                }
            }
        }
    }
    shape
}

/// A conic gradient as wedges round its centre, each in the colour at its middle: a ring that
/// fills with a value, a pie, a dial. On a round box the wedges end on the circle; otherwise at
/// the box's edges.
fn conic_shape(l: &Layer, radii: Option<[f32; 4]>, size: [f32; 2]) -> rune::Shape {
    let [w, h] = size;
    let mut shape = rune::Shape::new();
    if w <= 0.0 || h <= 0.0 || l.st.is_empty() {
        return shape;
    }
    let stops: Vec<(f32, Color)> = l.st.iter().map(|(t, c)| (*t, c.0)).collect();
    let centred = (l.cx - 0.5).abs() < 0.01 && (l.cy - 0.5).abs() < 0.01;
    let round = centred && radii.is_some_and(|r| r.iter().all(|v| *v >= w.min(h) * 0.5 - 0.5));
    let (cx, cy) = (l.cx * w, l.cy * h);
    let (rx, ry) = if round { (w * 0.5, h * 0.5) } else { (w + h, w + h) };
    // Wedge edges: every six degrees, and exactly where a stop sits so a hard edge stays hard.
    let mut edges: Vec<f32> = (0..=60).map(|i| i as f32 / 60.0).collect();
    edges.extend(stops.iter().map(|s| s.0.clamp(0.0, 1.0)));
    edges.sort_by(|a, b| a.total_cmp(b));
    edges.dedup_by(|a, b| (*a - *b).abs() < 1e-4);
    let at = |t: f32| {
        let angle = l.a + t * std::f32::consts::TAU;
        [cx + rx * angle.sin(), cy - ry * angle.cos()]
    };
    for pair in edges.windows(2) {
        let color = stop_color(&stops, (pair[0] + pair[1]) * 0.5);
        if color.a <= 0.0 {
            continue;
        }
        // Opaque wedges overlap by a hair so no seam shows between them.
        let lap = if color.a >= 1.0 { 0.002 } else { 0.0 };
        let mut wedge = vec![[cx, cy], at(pair[0] - lap), at(pair[1] + lap)];
        if !round {
            wedge = cut(&wedge, [1.0, 0.0], 0.0, false);
            wedge = cut(&wedge, [1.0, 0.0], w, true);
            wedge = cut(&wedge, [0.0, 1.0], 0.0, false);
            wedge = cut(&wedge, [0.0, 1.0], h, true);
        }
        if wedge.len() >= 3 {
            shape = shape.fill(wedge, color);
        }
    }
    shape
}

fn radial_radii(l: &Layer, [w, h]: [f32; 2]) -> [f32; 2] {
    let (dx, dy) = (l.cx.max(1.0 - l.cx) * w, l.cy.max(1.0 - l.cy) * h);
    let mut radii = match &l.rf {
        Some(RadialSize::Fraction([fx, fy])) => [fx * w, fy * h],
        Some(RadialSize::Keyword(k)) if k == "side" => [l.cx.min(1.0 - l.cx) * w, l.cy.min(1.0 - l.cy) * h],
        Some(RadialSize::Keyword(_)) => [dx * std::f32::consts::SQRT_2, dy * std::f32::consts::SQRT_2],
        None => [l.rx, l.ry],
    };
    if l.circle && l.rf.is_some() {
        let r = match &l.rf {
            Some(RadialSize::Keyword(k)) if k == "side" => radii[0].min(radii[1]),
            _ => dx.hypot(dy),
        };
        radii = [r, r];
    }
    radii.map(|v| v.max(0.01))
}

fn paint_layer(e: El, l: &Layer, radii: Option<[f32; 4]>, size: [f32; 2]) -> El {
    if let Some(c) = l.flat {
        return e.fill(c.0);
    }
    if l.g == 2 {
        return e.shape(conic_shape(l, radii, size));
    }
    if l.g == 0 && l.per > 0.0 {
        return e.shape(stripes_shape(l, size));
    }
    let radius = radial_radii(l, size);
    let extent = if l.g == 1 { radius[0] } else { l.a.sin().abs() * size[0] + l.a.cos().abs() * size[1] }.max(0.01);
    let stops: Vec<(f32, Color)> = l.st.iter().map(|(t, c)| (if l.ps { t / extent } else { *t }, c.0)).collect();
    if l.g != 1 {
        return e.linear_gradient(l.a, stops);
    }
    e.radial_gradient([l.cx, l.cy], radius, stops)
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
/// A dashed or dotted border that is not the same width on every side.
fn dashed_sides(b: &Box_) -> bool {
    b.dash != 0 && b.bw.is_some_and(|w| w.iter().any(|v| *v != w[0]))
}

fn needs_size(b: &Box_) -> bool {
    dashed_sides(b) ||
    b.ly.iter().any(|l| ((l.g != 0 || l.per > 0.0) && l.flat.is_none()) || l.bs.is_some() || l.img.is_some())
        || b.tf.is_some_and(|t| t[4] != 0.0 || t[5] != 0.0)
        || b.tfv.is_some()
        || !b.holes.is_empty()
        || b.fade.is_some()
        || !b.mask.is_empty()
        || b.bgtext
        || b.rad.is_some_and(|r| r.iter().any(|v| *v < 0.0))
        || b.svg.is_some()
        || b.img.is_some()
        || !b.cp.is_empty()
        || b.sk != 0.0
}

#[derive(Default)]
pub(crate) struct BoxCache {
    hashes: RefCell<HashMap<usize, u64>>,
    revision: Cell<Option<u64>>,
}

impl BoxCache {
    pub(crate) fn prepare(&self, nodes: &[crate::Node], revision: u64) -> bool {
        let mut hashes = self.hashes.borrow_mut();
        hashes.clear();
        for node in nodes { Self::fingerprint(node, revision, false, &mut hashes); }
        self.revision.replace(Some(revision)) != Some(revision)
    }

    fn fingerprint(node: &crate::Node, revision: u64, enclosed: bool, hashes: &mut HashMap<usize, u64>) {
        let crate::Node::X(b) = node else { return; };
        for child in &b.c { Self::fingerprint(child, revision, enclosed || !b.cp.is_empty(), hashes); }
        // Containers retain mutable layout/scroll state; editors retain selection and composition.
        if !b.c.is_empty() || b.inp.is_some() { return; }
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        revision.hash(&mut hash);
        for dim in [b.w, b.h, b.mnw, b.mnh, b.mxw, b.mxh, b.fb].into_iter().flatten()
            .chain(b.ins.into_iter().flatten()).chain(b.mg.into_iter().flatten()).chain(b.pd.into_iter().flatten()) {
            if let Dim::Slot { v, .. } = dim { crate::val(v).to_bits().hash(&mut hash); }
        }
        for slot in b.opv.into_iter().chain(b.tfv.into_iter().flatten()) { crate::val(slot).to_bits().hash(&mut hash); }
        if let Some(live) = b.t.as_ref().and_then(|text| text.live.as_ref()) {
            crate::val(live.n).to_bits().hash(&mut hash);
            for slot in &live.u { crate::val(*slot).to_bits().hash(&mut hash); }
        }
        if needs_size(b) || enclosed {
            RECTS.with(|rects| {
                if let Some(rect) = rects.borrow().get(&b.id) {
                    let values = if enclosed || !b.cp.is_empty() { &rect[..] } else { &rect[2..] };
                    for value in values { value.to_bits().hash(&mut hash); }
                }
            });
        }
        let version = hash.finish();
        hashes.insert(b.as_ref() as *const Box_ as usize, version);
    }
}

#[cfg(test)]
thread_local! {
    static BUILDS: RefCell<Vec<u32>> = const { RefCell::new(Vec::new()) };
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

fn clipped_paint(bg: Option<Rgba>, size: [f32; 2], poly: &[[f32; 2]]) -> rune::Shape {
    let [w, h] = size;
    let poly = poly.to_vec();
    let mut shape = rune::Shape::new();
    if w <= 0.0 || h <= 0.0 {
        return shape;
    }
    if let Some(c) = bg {
        if c.0.a > 0.0 && poly.len() >= 3 {
            shape = shape.fill(poly.clone(), c.0);
        }
    }
    shape
}

/// The sheet one background layer paints on: the whole box, or the piece its size and position give.
fn layer_sheet(l: &Layer, radii: Option<[f32; 4]>, size: [f32; 2]) -> El {
    if let Some(url) = &l.img {
        let image = crate::widgets::image_by_url(url, size[0].max(size[1]).max(32.0));
        let intrinsic = image.size().map_or(size, |s| s.map(|v| v as f32));
        let [iw, ih] = intrinsic.map(|v| v.max(0.01));
        let [w, h] = if l.fit != 0 {
            let scale = if l.fit == 1 { (size[0] / iw).max(size[1] / ih) } else { (size[0] / iw).min(size[1] / ih) };
            [iw * scale, ih * scale]
        } else { l.bs.map_or(intrinsic, |s| [s[0] + s[1] * size[0], s[2] + s[3] * size[1]]) };
        let bp = l.bp.unwrap_or([0.0; 4]);
        let [x,y] = [bp[0] + bp[1] * (size[0] - w), bp[2] + bp[3] * (size[1] - h)];
        let repeat = l.rp.unwrap_or([l.fit == 0; 2]);
        if w <= 0.0 || h <= 0.0 { return sheet(radii); }
        let (left, top) = (if repeat[0] {0.0} else {x}, if repeat[1] {0.0} else {y});
        let (width, height) = (if repeat[0] {size[0]} else {w}, if repeat[1] {size[1]} else {h});
        return sheet(radii).clip_corners(radii.unwrap_or([0.0;4])).child(
            el().pin(Some(left),Some(top),None,None).size(width,height)
                .pixels_tiled(image.pixels(), [w,h,x-left,y-top]).inert());
    }
    let Some(bs) = l.bs else { return paint_layer(sheet(radii), l, radii, size) };
    let (w, h) = (bs[0] + bs[1] * size[0], bs[2] + bs[3] * size[1]);
    let bp = l.bp.unwrap_or([0.0; 4]);
    let (x, y) = (bp[0] + bp[1] * (size[0] - w), bp[2] + bp[3] * (size[1] - h));
    if let Some(repeat) = l.rp {
        if w <= 0.0 || h <= 0.0 || size[0] <= 0.0 || size[1] <= 0.0 { return sheet(radii); }
        let radial = radial_radii(l, [w, h]);
        let extent = if l.g == 1 { radial[0] } else { l.a.sin().abs() * w + l.a.cos().abs() * h }.max(0.01);
        let stops = l.st.iter().map(|(at, color)| {
            let hex = color.0.hex();
            let at = if l.ps { at / extent } else { *at };
            format!("<stop offset=\"{}\" stop-color=\"{}\" stop-opacity=\"{}\"/>", at.clamp(0.0, 1.0), &hex[..7], color.0.a)
        }).collect::<String>();
        let gradient = if l.g == 1 {
            let (cx, cy) = (l.cx * w, l.cy * h);
            format!("<radialGradient id=\"g\" gradientUnits=\"userSpaceOnUse\" cx=\"{cx}\" cy=\"{cy}\" r=\"{}\" gradientTransform=\"translate({cx} {cy}) scale(1 {}) translate({} {})\">{stops}</radialGradient>", radial[0], radial[1] / radial[0], -cx, -cy)
        } else {
            let (dx, dy) = (l.a.sin() * extent * 0.5, -l.a.cos() * extent * 0.5);
            format!("<linearGradient id=\"g\" gradientUnits=\"userSpaceOnUse\" x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\">{stops}</linearGradient>", w * 0.5 - dx, h * 0.5 - dy, w * 0.5 + dx, h * 0.5 + dy)
        };
        let (px, py) = (if repeat[0] { x } else { x.min(0.0) }, if repeat[1] { y } else { y.min(0.0) });
        let (pw, ph) = (if repeat[0] { w } else { size[0] + w + x.abs() }, if repeat[1] { h } else { size[1] + h + y.abs() });
        let (tx, ty) = (if repeat[0] { 0.0 } else { x - px }, if repeat[1] { 0.0 } else { y - py });
        let svg = format!("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\"><defs>{gradient}<pattern id=\"p\" patternUnits=\"userSpaceOnUse\" x=\"{px}\" y=\"{py}\" width=\"{pw}\" height=\"{ph}\"><g transform=\"translate({tx} {ty})\"><rect width=\"{w}\" height=\"{h}\" fill=\"url(#g)\"/></g></pattern></defs><rect width=\"100%\" height=\"100%\" fill=\"url(#p)\"/></svg>", size[0], size[1], size[0], size[1]);
        return sheet(radii).pixels_fit(crate::widgets::image_of_svg(&svg, size[0].max(size[1])).pixels(), rune::SurfaceFit::Fill).inert();
    }
    paint_layer(el().pin(Some(x), Some(y), None, None).size(w.max(0.0), h.max(0.0)), l, None, [w, h])
}

/// A full-size, out-of-flow sheet for one more background layer.
fn sheet(radii: Option<[f32; 4]>) -> El {
    let e = el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0));
    match radii {
        Some(r) => e.corners(r),
        None => e,
    }
}

fn blend(e: El, mode: u8) -> El {
    match mode {
        2 => e.mix_blend(rune::render::Blend::Multiply),
        3 => e.mix_blend(rune::render::Blend::Overlay),
        4 => e.mix_blend(rune::render::Blend::Screen),
        5 => e.mix_blend(rune::render::Blend::SoftLight),
        6 => e.mix_blend(rune::render::Blend::DestinationIn),
        7 => e.mix_blend(rune::render::Blend::SourceIn),
        8 => e.mix_blend(rune::render::Blend::SourceOut),
        9 => e.mix_blend(rune::render::Blend::Xor),
        _ => e,
    }
}

fn colored_border(mut e: El, widths: [f32; 4], colors: [Color; 4], radii: Option<[f32; 4]>, layout_border: [f32; 4]) -> El {
    let mut drawn = [false; 4];
    let mut first = true;
    for side in 0..4 {
        if drawn[side] || widths[side] <= 0.0 { continue; }
        let color = colors[side];
        let mut group = [0.0; 4];
        for other in side..4 {
            if !drawn[other] && colors[other] == color {
                group[other] = widths[other];
                drawn[other] = true;
            }
        }
        if color.a <= 0.0 { continue; }
        if first { e = e.border_sides(group, color); first = false; }
        else {
            let overlay = sheet(radii).pin(Some(-layout_border[3]), Some(-layout_border[0]), Some(-layout_border[1]), Some(-layout_border[2]));
            e = e.child(overlay.border_sides(group, color).inert());
        }
    }
    e
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
    let body = t.live.as_ref().map_or_else(|| t.s.clone(), LiveText::read);
    let mut e = text(body.clone()).font(text_style(t)).color(color);
    if !t.sp.is_empty() {
        let spans: Vec<Span> = t
            .sp
            .iter()
            .map(|s| {
                // The page counts in UTF-16 units; the text layout counts in bytes.
                let mut span = Span::new(byte_at(&body, s.a as usize), byte_at(&body, s.b as usize));
                span.color = s.c.map(|c| c.0);
                span.weight = s.w;
                span.family = s.f.as_ref().map(|name| family(name));
                span.size = s.z;
                span.italic = s.i;
                span.bg = s.bg.map(|c| c.0);
                if s.u {
                    span.underline = Some(s.uc.or(s.c).map_or(color, |c| c.0));
                    span.underline_width = s.ut;
                    span.underline_offset = s.uo;
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
    let version = s.cache.hashes.borrow().get(&(b as *const Box_ as usize)).copied();
    let Some(version) = version else { return build_box(b, path, s, t); };
    let key = if b.id == 0 { format!("t{path}") } else { format!("x{}", b.id) };
    rune::memo::memo_with_hash(key, version, || build_box(b, path, s, t))
}

fn build_box(b: &Box_, path: &str, s: &Ui, t: &rune::tok::Theme) -> El {
    #[cfg(test)]
    BUILDS.with(|builds| builds.borrow_mut().push(b.id));
    let key = if b.id == 0 { format!("t{path}") } else { format!("x{}", b.id) };
    let scrolls = b.ovx == 2 || b.ovy == 2;
    let enclosed = CLIPS.with(|c| !c.borrow().is_empty());
    let sized = needs_size(b) || enclosed;
    let size = if sized { size_of(b.id).unwrap_or([0.0, 0.0]) } else { [0.0, 0.0] };
    let radii = b.rad.map(|r| r.map(|v| if v < 0.0 { -v * size[0].min(size[1]) } else { v }));
    let mut e = el();
    e = e.layout_style(|st| layout(b, st));
    let rect = RECTS.with(|r| r.borrow().get(&b.id).copied());
    let clip = clip_of(b, rect);
    let clipped = clip.is_some();
    let background_blends = b.bgblend != 0 || b.ly.iter().any(|l| l.blend != 0) || b.bgtext;
    let skewed = b.sk != 0.0 && b.cp.is_empty();
    if let Some(poly) = &clip {
        let mut shape = clipped_paint(if background_blends { None } else { b.bg }, size, poly);
        // A skewed box's border follows its slanted sides.
        if let (true, Some(w), Some(c)) = (skewed && !background_blends, b.bw, b.bc) {
            let width = w.iter().fold(0.0, |a: f32, v| a.max(*v));
            if width > 0.0 && poly.len() >= 3 {
                shape = shape.stroke_with(poly.clone(), true, width, rune::LineCap::Butt, c.0);
            }
        }
        e = e.shape(shape);
    } else if let Some(c) = b.bg.filter(|_| !background_blends) {
        e = e.fill(c.0);
    }
    if let Some(r) = radii {
        e = e.corners(r);
    }
    // A blended background is a child scope. Its borders and outline paint after that scope,
    // in the original border box, while the parent alone owns the layout border.
    let widths = b.bw.unwrap_or([0.0; 4]);
    let unbordered = background_blends.then(|| std::mem::replace(&mut e,
        sheet(radii).pin(Some(-widths[3]), Some(-widths[0]), Some(-widths[1]), Some(-widths[2])).inert()));
    let layout_border = if background_blends { [0.0; 4] } else { widths };
    if background_blends && skewed && let (Some(poly), Some(color)) = (&clip, b.bc) {
        let width = widths.iter().fold(0.0, |a: f32, v| a.max(*v));
        if width > 0.0 && poly.len() >= 3 { e = e.shape(rune::Shape::new().stroke_with(poly.clone(), true, width, rune::LineCap::Butt, color.0)); }
    }
    if let (Some(w), Some(c), false) = (b.bw, b.bc, skewed) && b.dbl != 0 {
        let colors = b.bcs.map_or([c.0; 4], |colors| colors.map(|color| color.0));
        let double = |side: usize| b.dbl & (1u8 << side) != 0 && w[side] >= 3.0;
        let outer = std::array::from_fn(|side| if double(side) { (w[side] / 3.0).round().max(1.0) } else { w[side] });
        let inner = std::array::from_fn(|side| if double(side) { outer[side] } else { 0.0 });
        let inset = std::array::from_fn::<_, 4, _>(|side| if double(side) { w[side] - inner[side] } else { 0.0 });
        e = colored_border(e, outer, colors, radii, layout_border);
        let inner_radii = radii.map(|radii| std::array::from_fn(|corner| (radii[corner] - inset[corner].max(inset[(corner + 3) % 4])).max(0.0)));
        // Absolute children start at the padding box; these strokes belong in the border box.
        let mut ring = el().pin(Some(inset[3] - layout_border[3]), Some(inset[0] - layout_border[0]), Some(inset[1] - layout_border[1]), Some(inset[2] - layout_border[2]));
        if let Some(radii) = inner_radii { ring = ring.corners(radii); }
        e = e.child(colored_border(ring, inner, colors, inner_radii, [0.0; 4]).inert());
    } else if let (Some(w), Some(colors), false) = (b.bw, b.bcs, skewed) {
        e = colored_border(e, w, colors.map(|color| color.0), radii, layout_border);
    } else if let (Some(w), Some(c), true, false) = (b.bw, b.bc, dashed_sides(b), skewed) {
        // Rune dashes a border all the way round; a rule dashed on some sides only is drawn side by side.
        e = e.child(sheet(None).shape(dashes_shape(w, c.0, b.dash, size)).inert());
    } else if let (Some(w), Some(c), false) = (b.bw, b.bc, skewed) {
        if w.iter().any(|v| *v > 0.0) {
            e = e.border_sides(w, c.0);
            if b.dash != 0 {
                let unit = w.iter().fold(0.0, |a: f32, v| a.max(*v));
                e = if b.dash == 1 { e.border_dash(unit, unit) } else { e.border_dash(unit * 3.0, unit * 2.0) };
            }
        }
    }
    if let (Some([width, offset, dashes]), Some(c)) = (b.ol, b.olc) {
        if dashes == 0.0 {
            e = e.outline(width, offset, c.0);
        } else {
            // A dashed ring: a sheet that far outside (or inside) the box, with a dashed border.
            let out = -(offset + width);
            let grown = radii.map(|r| r.map(|v| (v + offset + width).max(0.0)));
            let ring = el().pin(Some(out), Some(out), Some(out), Some(out)).border_sides([width; 4], c.0);
            let ring = if dashes == 1.0 { ring.border_dash(width, width) } else { ring.border_dash(width * 3.0, width * 2.0) };
            e = e.child(match grown {
                Some(r) => ring.corners(r).inert(),
                None => ring.inert(),
            });
        }
    }
    let border_paint = unbordered.map(|parent| std::mem::replace(&mut e, parent));
    if b.bblur > 0.0 {
        e = e.backdrop_blur(b.bblur);
    }
    e = blend(e, b.blend);
    if b.isolate { e = e.isolate(); }
    for (sh, c) in &b.sh {
        e = e.box_shadow(Shadow { x: sh[0], y: sh[1], blur: sh[2], spread: sh[3], color: c.0, inset: sh[4] > 0.5 });
    }
    if let Some(o) = b.opv.map(crate::val).or(b.op) {
        e = e.opacity(o);
    }
    if let Some([tx, ty, rot, sc, fx, fy]) = b.tfv.map(|slots| slots.map(crate::val)).or(b.tf) {
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
    for filter in &b.fx {
        e = match filter.kind {
            0 => e.brightness(filter.n),
            1 => e.filter_blur(filter.n),
            2 => if let Some((x,y,sigma,c)) = filter.sh { e.drop_shadow(x,y,sigma,c.0) } else { e },
            _ => e,
        };
    }
    for hole in &b.holes {
        e = e.cutout_circle([hole[0] + hole[1] * size[0], hole[2] + hole[3] * size[1]], hole[4], hole[5]);
    }
    if b.ovx == 1 || b.ovy == 1 {
        e = e.clip_corners(radii.unwrap_or([0.0; 4]));
    }
    if let Some(fade) = b.fade {
        let widths: [f32; 4] = std::array::from_fn(|side| fade[side * 2] + fade[side * 2 + 1] * size[side % 2]);
        e = e.clip_fade_linear(widths[0], widths[1], widths[2], widths[3]);
    }
    let mut background = background_blends.then(|| {
        let widths = b.bw.unwrap_or([0.0; 4]);
        let mut background = sheet(radii).pin(Some(-widths[3]), Some(-widths[0]), Some(-widths[1]), Some(-widths[2])).isolate().inert();
        if let Some(poly) = &clip { background = background.shape(clipped_paint(b.bg, size, poly)); }
        else if let Some(color) = b.bg { background = background.fill(color.0); }
        for l in &b.ly {
            let layer = layer_sheet(l, radii, size);
            background = background.child(blend(layer, l.blend));
        }
        background
    });
    // The lowest ordinary gradient paints on the box; blended backgrounds share their own scope.
    if clipped && !background_blends {
        // The polygon took the colour and the gradients that fill the box; pieces placed inside it
        // (rivets, corner marks) are drawn as they are.
        for l in &b.ly {
            e = e.child(layer_sheet(l, radii, size));
        }
    }
    let mut layers = if clipped || background_blends { [].iter() } else { b.ly.iter() };
    if let Some(first) = layers.next() {
        e = if first.img.is_some() || (first.flat.is_some() && b.bg.is_some()) || first.bs.is_some() {
            e.child(layer_sheet(first, radii, size))
        } else {
            paint_layer(e, first, radii, size)
        };
    }
    for l in layers {
        e = e.child(layer_sheet(l, radii, size));
    }
    let text_background = if b.bgtext { background.take() } else { None };
    if let Some(background) = background { e = e.child(background); }
    if let Some(border) = border_paint { e = e.child(border); }
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
    if b.island != 0 && let Some(pixels) = crate::widgets::canvas_image(b.id) {
        e = e.pixels(&pixels);
        if let Some(radii) = radii { e = e.clip_corners(radii); }
    }
    let own = (!b.cp.is_empty()).then_some(()).and(rect).zip(clip.as_ref()).map(|(r, poly)| poly.iter().map(|p| [p[0] + r[0], p[1] + r[1]]).collect::<Vec<_>>());
    let pushed = own.is_some();
    if let Some(poly) = own { CLIPS.with(|c| c.borrow_mut().push(poly)); }
    let under = |child: &crate::Node| matches!(child, crate::Node::X(child) if child.pos == 2 && child.z < 0);
    for (i, ch) in b.c.iter().enumerate().filter(|(_, child)| under(child)) {
        e = e.child(crate::build::build(ch, &format!("{path}.{i}"), s, t));
    }
    if let Some(inp) = &b.inp {
        e = e.child(input_el(b, inp, s).key("field").layout_style(|style| {
            style.flex_grow = 1.0;
            style.flex_shrink = 1.0;
            style.min_size.width = length(0.0);
        }));
    } else if let Some(t) = &b.t {
        let grow = |st: &mut Style| {
            st.flex_shrink = 1.0;
            st.min_size.width = length(0.0);
        };
        if t.ts.is_empty() {
            e = e.child(text_el(t, if b.bgtext { Color::WHITE } else { t.c.0 }).layout_style(grow));
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
        e = e.scroll_axes(b.ovx == 2, b.ovy == 2).hit();
        if b.id != 0 {
            let id = b.id;
            e = e.on_scroll_offset(move |at| crate::emit_scroll(id, at));
        }
    }
    for (i, ch) in b.c.iter().enumerate().filter(|(_, child)| !under(child)) {
        e = e.child(crate::build::build(ch, &format!("{path}.{i}"), s, t));
    }
    if pushed {
        CLIPS.with(|c| c.borrow_mut().pop());
    }
    if let Some(background) = text_background {
        e = e.isolate().child(blend(background, 7));
    }
    if !b.mask.is_empty() {
        let widths = b.bw.unwrap_or([0.0; 4]);
        let mut mask = sheet(None).pin(Some(-widths[3]), Some(-widths[0]), Some(-widths[1]), Some(-widths[2])).isolate();
        for layer in &b.mask {
            mask = mask.child(blend(sheet(None).isolate().child(layer_sheet(layer, None, size)), layer.blend));
        }
        e = e.isolate().child(blend(mask, 6));
    }
    if !b.cp.is_empty() && let Some(poly) = &clip {
        let widths = b.bw.unwrap_or([0.0; 4]);
        let mask = sheet(None).pin(Some(-widths[3]), Some(-widths[0]), Some(-widths[1]), Some(-widths[2]));
        e = e.isolate().child(blend(mask.shape(rune::Shape::new().fill(poly.clone(), Color::WHITE)), 6));
    }
    let id = b.id;
    if id != 0 {
        let follows_position = enclosed && (b.bg.is_some() || !b.ly.is_empty());
        e = e.on_layout_tx(move |_: &mut Ui, rect: [f32; 4], tx: &mut Tx| {
            let (grew, moved) = RECTS.with(|r| {
                let mut r = r.borrow_mut();
                let old = r.insert(id, rect);
                (old.is_none_or(|o| (o[2] - rect[2]).abs() > 0.25 || (o[3] - rect[3]).abs() > 0.25),
                    old.is_none_or(|o| (o[0] - rect[0]).abs() > 0.25 || (o[1] - rect[1]).abs() > 0.25))
            });
            RECTS_DIRTY.set(true);
            // Recut ancestor polygons when scrolling moves paint through their edges.
            if !(sized && grew || follows_position && moved) {
                tx.live_only();
            } else {
                tx.instant();
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
    if inp.cols > 0 {
        e = e.input_columns(inp.cols);
        if matches!(b.w, Some(Dim::Pct(_))) { e = e.input_columns_shrink(); }
    }
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

#[cfg(test)]
mod live_value_tests {
    use super::*;

    #[test]
    fn cached_scroll_rows_keep_painting_across_other_leaf_updates_and_replacements() {
        RECTS.with(|rects| rects.borrow_mut().clear());
        crate::set_val(7750, 1.0); crate::set_val(7751, '0' as u32 as f32);
        let spec = |offset: u32| {
            let rows: Vec<_> = (0..20).map(|i| serde_json::json!({"k":"x","id":offset+100+i,"h":24,"fs":0,"bg":4294967295_u32,"t":{"s":format!("STATIC ROW {i}"),"z":16,"c":255}})).collect();
            crate::spec::parse_spec(&serde_json::json!({"children":[{"k":"x","id":1,"w":200,"h":300,"fd":1,"c":[{"k":"x","id":2,"t":{"s":"0","z":20,"c":4294967295_u32,"live":{"n":7750,"u":[7751,7752]}}},{"k":"x","id":offset+3,"fd":1,"fg":1,"mnh":0,"ovy":2,"c":rows}]}]}).to_string()).unwrap().children
        };
        let mut state = Ui::default(); state.root = spec(0);
        let mut runtime = rune::Runtime::new(state, crate::build::view, (200.0, 300.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        for i in 0..60 {
            if i == 25 { let root = spec(1000); runtime.update(move |state, tx| { tx.instant(); state.root = root; state.revision += 1; }); }
            crate::set_val(7750, 2.0); crate::set_val(7751, ('0' as u32 + i / 10) as f32); crate::set_val(7752, ('0' as u32 + i % 10) as f32);
            runtime.update(|_, tx| tx.instant()); runtime.frame(0.02);
            let glyphs = runtime.instances.iter().filter(|quad| quad.params[1] == 2.0 && quad.rect[2] > 0.0 && quad.rect[3] > 0.0).count();
            assert!(glyphs >= 100, "cached scroll content disappeared on update {i}: {glyphs} glyphs");
        }
    }

    #[test]
    fn a_changing_shared_label_rebuilds_its_branch_and_reflows_without_rebuilding_its_neighbor() {
        RECTS.with(|rects| rects.borrow_mut().clear());
        crate::set_val(7700, 1.0); crate::set_val(7701, '9' as u32 as f32);
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":200,"h":50,"c":[{"k":"x","id":2,"t":{"s":"9","z":20,"c":4294967295,"live":{"n":7700,"u":[7701,7702,7703]}}},{"k":"x","id":3,"w":40,"h":20,"bg":4294967295}]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (200.0, 50.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        for _ in 0..2 { runtime.update(|_, tx| tx.instant()); runtime.frame(0.01); }
        let left = |runtime: &rune::Runtime<Ui>| runtime.elements().into_iter().find(|element| element.key.as_deref() == Some("x3")).unwrap().rect[0];
        let before = left(&runtime);
        BUILDS.with(|builds| builds.borrow_mut().clear());
        crate::set_val(7700, 3.0);
        for (slot, unit) in [7701, 7702, 7703].into_iter().zip("100".encode_utf16()) { crate::set_val(slot, unit as f32); }
        runtime.update(|_, tx| tx.instant()); runtime.frame(0.01);
        BUILDS.with(|builds| {
            let builds = builds.borrow();
            assert!(builds.contains(&2), "the changing text did not rebuild");
            assert!(!builds.contains(&3), "an unrelated static branch rebuilt: {builds:?}");
        });
        assert!(left(&runtime) > before + 10.0, "the growing label stopped reflowing its neighbor: {before} -> {}", left(&runtime));
        BUILDS.with(|builds| builds.borrow_mut().clear());
        assert!(!runtime.frame(0.1), "unchanged UI requested another frame");
        BUILDS.with(|builds| assert!(builds.borrow().is_empty()));
        runtime.update(|state, tx| { tx.instant(); state.revision += 1; if let crate::Node::X(root) = &mut state.root[0] { root.gap = Some([10.0, 0.0]); } });
        runtime.frame(0.01);
        BUILDS.with(|builds| assert!(builds.borrow().contains(&3), "a spec change reused the old subtree"));
    }

    #[test]
    fn a_double_border_has_two_strokes_and_preserves_its_full_layout_width() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":100,"h":50,"bw":[0,0,3,0],"bc":4294967295,"dbl":4}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (100.0, 50.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let strokes: Vec<_> = runtime.instances.iter().filter(|quad| quad.border[3] > 0.0 && quad.params[0] > 0.0).collect();
        assert_eq!(strokes.len(), 2, "double border stayed one thick stroke");
        assert!(strokes.iter().all(|quad| quad.params[0] == 1.0));
        assert!(strokes.iter().any(|quad| quad.rect == [0.0, 0.0, 100.0, 50.0]));
        assert!(strokes.iter().any(|quad| quad.rect == [0.0, 0.0, 100.0, 48.0]), "inner stroke did not leave a one-point gap: {strokes:?}");
    }

    #[test]
    fn differently_colored_border_sides_share_the_same_outer_box() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":100,"h":50,"bw":[2,3,4,5],"bc":4294967295,"bcs":[4278190335,16711935,65535,4294967295]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (100.0, 50.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let strokes: Vec<_> = runtime.instances.iter().filter(|quad| quad.border[3] > 0.0 && quad.params[0] > 0.0).collect();
        assert_eq!(strokes.len(), 4);
        assert!(strokes.iter().all(|quad| quad.rect == [0.0, 0.0, 100.0, 50.0]), "a differently colored side slipped inside the layout border: {strokes:?}");
    }

    #[test]
    fn a_percentage_input_does_not_widen_its_automatic_grid_column() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":300,"d":2,"gtc":[[0,0,3,1]],"c":[{"k":"x","id":2,"d":2,"c":[{"k":"x","id":3,"d":1,"w":"100%","inp":{"v":"","cols":20},"t":{"s":"","z":38,"c":4294967295}}]}]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (300.0, 300.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let field = runtime.elements().into_iter().find(|element| element.key.as_deref() == Some("x3")).unwrap().rect;
        assert!(field[0] + field[2] <= 300.5, "percentage input widened its grid: {field:?}");
        assert!(field[2] > 299.0, "percentage input stopped filling its grid: {field:?}");
    }

    #[test]
    fn anonymous_flex_text_obeys_its_parents_center_alignment() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":200,"h":100,"ai":3,"jc":3,"t":{"s":"Empty slot","z":14,"c":4294967295}}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (200.0, 100.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let glyphs: Vec<_> = runtime.instances.iter().filter(|quad| quad.params[1] == rune::render::KIND_GLYPH).collect();
        let left = glyphs.iter().map(|quad| quad.rect[0]).reduce(f32::min).unwrap();
        let right = glyphs.iter().map(|quad| quad.rect[0] + quad.rect[2]).reduce(f32::max).unwrap();
        assert!(((left + right) * 0.5 - 100.0).abs() < 5.0, "centered flex text stayed at the left: {left}..{right}");
    }

    #[test]
    fn scrollable_grid_rows_keep_their_intrinsic_text_height() {
        let rows: Vec<_> = (0..20).map(|i| serde_json::json!({"k":"x","id":10+i,"d":2,"c":(0..3).map(|_| serde_json::json!({"k":"x","d":1,"t":{"s":"Text line","z":14,"lh":18,"c":4294967295_u32}})).collect::<Vec<_>>()})).collect();
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(&serde_json::json!({"children":[{"k":"x","id":1,"d":2,"w":200,"h":100,"ovy":2,"ac":1,"gtc":[[1,0,3,1],[1,0,3,1]],"c":rows}]}).to_string()).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (200.0, 100.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let rect = |key| runtime.elements().into_iter().find(|element| element.key.as_deref() == Some(key)).unwrap().rect;
        assert!(rect("x10")[3] >= 53.0, "the scroll viewport compressed its text rows: {:?}", rect("x10"));
        assert!(rect("x29")[1] > 100.0);
    }

    #[test]
    fn scrolling_rebuilds_paint_intersecting_an_ancestor_polygon() {
        RECTS.with(|rects| rects.borrow_mut().clear());
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":200,"h":100,"cp":[[0,0,0,0],[0,1,0,0],[0,1,0,1],[0,0,0,1]],"c":[{"k":"x","id":2,"w":200,"h":50,"ovx":2,"c":[{"k":"x","id":3,"w":180,"h":30,"fs":0,"bg":4278190335},{"k":"x","id":4,"w":180,"h":30,"fs":0}]}]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (200.0, 100.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        for _ in 0..3 { runtime.update(|_, tx| tx.instant()); runtime.frame(0.01); }
        for x in [100.0, 0.0] {
            BUILDS.with(|builds| builds.borrow_mut().clear());
            runtime.update(|_, tx| { tx.live_only(); tx.scroll_to_instant("x2", x, 0.0); });
            for _ in 0..3 { runtime.frame(0.01); }
            BUILDS.with(|builds| assert!(builds.borrow().contains(&3), "scrolling to {x} left paint cut to its previous position"));
        }
        assert!(!runtime.frame(0.1), "settled clipping keeps requesting frames");
    }

    #[test]
    fn a_negative_positioned_child_paints_before_its_parents_text() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":200,"h":50,"t":{"s":"Hello","z":20,"c":4294967295},"c":[{"k":"x","id":2,"pos":2,"z":-1,"ins":[0,0,0,0],"bg":4278190335}]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (200.0, 50.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let glyph = runtime.instances.iter().position(|quad| quad.params[1] == rune::render::KIND_GLYPH).unwrap();
        let background = runtime.instances.iter().position(|quad| quad.fill == [1.0, 0.0, 0.0, 1.0]).unwrap();
        assert!(background < glyph, "negative layer painted over its parent's own text");
    }

    #[test]
    fn a_horizontal_css_rail_preserves_its_layout_and_reports_scroll_extent() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":200,"h":40,"ovx":2,"ovy":2,"c":[{"k":"x","id":2,"w":180,"h":30,"fs":0},{"k":"x","id":3,"w":180,"h":30,"fs":0}]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (200.0, 40.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let rect = |runtime: &rune::Runtime<Ui>, key| runtime.elements().into_iter().find(|element| element.key.as_deref() == Some(key)).unwrap().rect;
        assert_eq!(rect(&runtime, "x3")[0], 180.0);
        runtime.update(|_, tx| { tx.live_only(); tx.scroll_to_instant("x1", 100.0, 0.0); });
        runtime.frame(0.01);
        assert_eq!(rect(&runtime, "x2")[0], -100.0, "horizontal overflow did not scroll");
        assert_eq!(rect(&runtime, "x3")[0], 80.0);
    }

    #[test]
    fn a_growing_flex_child_keeps_its_inner_scroller_bounded_and_heading_fixed() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":200,"h":200,"fd":1,"ovy":2,"c":[{"k":"x","id":2,"fd":1,"fg":1,"mnh":0,"c":[{"k":"x","id":3,"h":20,"fs":0},{"k":"x","id":4,"fd":1,"mnh":0,"ovy":2,"c":[{"k":"x","id":5,"h":500,"fs":0}]}]}]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (200.0, 200.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let rect = |runtime: &rune::Runtime<Ui>, key| runtime.elements().into_iter().find(|element| element.key.as_deref() == Some(key)).unwrap().rect;
        let pane = rect(&runtime, "x4");
        assert!(pane[3] <= 180.0, "the inner scroller grew to its whole content instead of its viewport: {pane:?}");
        let heading = rect(&runtime, "x3");
        let body = rect(&runtime, "x5");
        runtime.wheel_event(rune::WheelEvent::new(0.0, -60.0).at(50.0, 100.0).precise(true));
        runtime.frame(0.1);
        assert_eq!(rect(&runtime, "x3"), heading, "scrolling moved the fixed heading");
        assert!(rect(&runtime, "x5")[1] < body[1] - 50.0);
        crate::EVENTS.with(|events| events.borrow_mut().clear());
        runtime.update(|_, tx| { tx.live_only(); tx.scroll_to_y("x4", 100.0); });
        runtime.frame(0.2);
        let metrics = crate::EVENTS.with(|events| events.borrow().iter().rev().find(|event| event.id == "x4" && event.kind == "scroll").and_then(|event| event.scroll)).unwrap();
        assert_eq!(metrics[1], 100.0);
        assert_eq!(metrics[3], 180.0);
        assert_eq!(metrics[5], 500.0);
    }

    #[test]
    fn an_auto_scroll_child_without_overflow_does_not_block_its_scrollable_parent() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":200,"h":100,"ovy":2,"c":[{"k":"x","id":2,"d":1,"ovy":2,"c":[{"k":"x","id":3,"w":100,"h":500,"bg":4294967295}]}]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (200.0, 100.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let top = |runtime: &rune::Runtime<Ui>| runtime.elements().into_iter().find(|element| element.key.as_deref() == Some("x3")).unwrap().rect[1];
        let before = top(&runtime);
        runtime.wheel_event(rune::WheelEvent::new(0.0, -60.0).at(50.0, 50.0).precise(true));
        runtime.frame(0.1);
        assert!(top(&runtime) < before - 50.0, "an inactive inner scroll area swallowed its parent's wheel");
    }

    #[test]
    fn inline_families_shape_wrap_and_cache_as_one_paragraph() {
        let _families = rune::text::with_families("Inter", "IBM Plex Mono");
        let mut fonts = rune::text::TextSystem::new(
            &[
                include_bytes!("../../../vendor/rune/crates/rune/assets/Inter-Regular.ttf"),
                include_bytes!("../../../vendor/rune/crates/rune/assets/IBMPlexMono-Regular.ttf"),
            ],
            ("Inter", "IBM Plex Mono"),
        );
        let style = TextStyle::new(24.0, 400.0);
        let text = "iiii a paragraph with its normal body font after a different-family lead.";
        let regular = fonts.layout_rich(text, &[], style, 1.0, None).width();
        let mut lead = Span::new(0, 4);
        lead.family = Some(Family::Named("IBM Plex Mono"));
        let mixed = fonts.layout_rich(text, &[lead.clone()], style, 1.0, None).width();
        assert!(mixed > regular + 15.0, "inline family stayed in the paragraph's font: {regular}, {mixed}");
        assert_eq!(fonts.layout_rich(text, &[], style, 1.0, None).width(), regular);
        let wrapped = fonts.layout_rich(text, &[lead], style, 1.0, Some(180.0));
        assert!(wrapped.len() > 1);
        assert!(wrapped.width() <= 181.0, "inline font prevented paragraph wrapping");
    }

    #[test]
    fn a_regular_only_game_font_synthesizes_bold_and_keeps_distinct_cached_masks() {
        let _families = rune::text::with_families("Inter", "Inter");
        for smoothing in [rune::text::FontSmoothing::On, rune::text::FontSmoothing::Off] {
            let mut fonts = rune::text::TextSystem::new(
                &[include_bytes!("../../../vendor/rune/crates/rune/assets/Inter-Regular.ttf")],
                ("Inter", "Inter"),
            );
            fonts.set_font_smoothing(smoothing);
            let regular = TextStyle::new(48.0, 400.0);
            let mut quads = |style| {
                let mut glyphs = Vec::new();
                fonts.glyphs("I", style, 1.0, [0.0, 0.0], &mut glyphs);
                assert_eq!(glyphs.len(), 1);
                glyphs[0].rect
            };
            let plain = quads(regular);
            for weight in [600.0, 700.0] {
                let heavy = quads(TextStyle::new(48.0, weight));
                assert!(heavy[2] > plain[2] + 1.0, "weight {weight} stayed regular: {plain:?}, {heavy:?}");
            }
            assert_eq!(quads(regular), plain, "bold overwrote the regular glyph's cached mask");
        }
    }

    #[test]
    fn wrapping_row_stretches_before_distributing_its_children() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":400,"fd":1,"c":[{"k":"x","id":2,"fw":1,"jc":6,"gap":[8,8],"c":[{"k":"x","id":3,"w":100,"h":30},{"k":"x","id":4,"w":100,"h":30}]}]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (400.0, 300.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let elements = runtime.elements();
        let rect = |key| elements.iter().find(|element| element.key.as_deref() == Some(key)).unwrap().target;
        assert_eq!(rect("x2")[2], 400.0);
        assert_eq!(rect("x4")[0], 300.0);
    }

    #[test]
    fn wrapping_percentage_cards_fill_their_intrinsic_grid_cell() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":362,"d":2,"ji":3,"c":[{"k":"x","id":2,"mnw":0,"fw":1,"fitw":1,"jc":3,"gap":[22,22],"mxw":[0,1,760,0,1],"c":[{"k":"x","id":3,"d":1,"w":"100%","mnw":0,"c":[{"k":"x","id":4,"w":150,"h":250}]},{"k":"x","id":5,"d":1,"w":"100%","mnw":0,"c":[{"k":"x","id":6,"w":150,"h":250}]},{"k":"x","id":7,"d":1,"w":"100%","mnw":0,"c":[{"k":"x","id":8,"w":150,"h":250}]}]}]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (390.0, 844.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let elements = runtime.elements();
        let rect = |key| elements.iter().find(|element| element.key.as_deref() == Some(key)).unwrap().target;
        let first = rect("x3");
        let second = rect("x5");
        assert!((first[2] - 362.0).abs() < 1.0, "percentage card was {first:?}");
        assert!(second[1] >= first[1] + first[3] + 21.0, "cards failed to wrap: {first:?}, {second:?}");
    }

    #[test]
    fn input_columns_preserve_intrinsic_width_inside_a_capped_percentage() {
        let mut state = Ui::default();
        state.root = crate::spec::parse_spec(r#"{"children":[{"k":"x","id":1,"w":800,"h":600,"d":2,"ji":1,"c":[{"k":"x","id":2,"d":2,"c":[{"k":"x","id":0,"t":{"s":"Park name","z":14,"c":4294967295}},{"k":"x","id":3,"d":1,"w":"100%","mxw":360,"mnw":0,"pd":[4,6,4,6],"bw":[0,0,2,0],"bc":4294967295,"dash":2,"inp":{"v":"","ph":"Brightway Park","cols":20},"t":{"s":"","z":22,"w":700,"c":4294967295}}]}]}]}"#).unwrap().children;
        let mut runtime = rune::Runtime::new(state, crate::build::view, (800.0, 600.0), rune::Env::new(true, 1.0));
        runtime.frame(0.0);
        let field = runtime.elements().into_iter().find(|element| element.key.as_deref() == Some("x3")).unwrap().target;
        assert!(field[2] > 200.0 && field[2] <= 360.0, "20-character input collapsed to {field:?}");
        assert!(field[3] > 35.0, "the field lost its editable text leaf: {field:?}");
    }

    #[test]
    fn css_dimensions_and_unicode_text_read_shared_slots() {
        let dimension: Dim = serde_json::from_str(r#"{"v":8000,"p":true}"#).unwrap();
        crate::set_val(8000, 0.25);
        assert_eq!(dimension.dimension(), Dimension::percent(0.25));
        crate::set_val(8000, 0.75);
        assert_eq!(dimension.dimension(), Dimension::percent(0.75));
        let body = "01:23 🦉";
        let units: Vec<u16> = body.encode_utf16().collect();
        let slots: Vec<usize> = (8002..8002 + units.len()).collect();
        crate::set_val(8001, units.len() as f32);
        for (slot, unit) in slots.iter().zip(&units) {
            crate::set_val(*slot, *unit as f32);
        }
        let text = LiveText { n: 8001, u: slots };
        assert_eq!(text.read(), body);
        crate::set_val(8006, '2' as u32 as f32);
        assert_eq!(text.read(), "01:22 🦉");
    }
}
