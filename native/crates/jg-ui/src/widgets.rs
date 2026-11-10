//! Custom widgets the spec's primitive set cannot express with plain elements:
//! the dial gauge, segmented cells, the switch, key caps, SVG icons and the
//! option cycler. All read the shared value buffer while the view builds.

use std::cell::RefCell;
use std::collections::HashMap;

use rune::tok;
use rune::{Align, Color, El, Icon, LineCap, Shape, TextCase, canvas, col, el, icon as rune_icon, row, text};

use crate::spec::Tone;
use crate::{color, val};

/// Arc points in element space: `deg` measured clockwise from +x with y down,
/// matching CSS `rotate()` on an SVG circle.
fn arc_points(cx: f32, cy: f32, r: f32, start_deg: f32, sweep_deg: f32, segs: usize) -> Vec<[f32; 2]> {
    (0..=segs)
        .map(|i| {
            let a = (start_deg + sweep_deg * i as f32 / segs as f32).to_radians();
            [cx + r * a.cos(), cy + r * a.sin()]
        })
        .collect()
}

/// The colour a slot value reads as under a [`Tone`].
pub fn tone_color(tone: &Tone, v: f32) -> Color {
    let hex = if v <= tone.bad {
        &tone.colors[2]
    } else if v <= tone.warn {
        &tone.colors[1]
    } else {
        &tone.colors[0]
    };
    color(hex)
}

const DIAL_VIEW: f32 = 120.0;
const DIAL_CX: f32 = 60.0;
const DIAL_CY: f32 = 60.0;
const DIAL_R: f32 = 46.0;
const DIAL_START: f32 = 135.0;
const DIAL_SWEEP: f32 = 270.0;

/// The dial's static furniture plus its live arc: bezel, track, ticks, then the
/// progress arc drawn twice (wide translucent glow, then the reading itself).
pub fn dial_shape(frac: f32, tone: &Tone, v: f32) -> Shape {
    let mut s = Shape::new().view_box(DIAL_VIEW, DIAL_VIEW);
    let bezel = color("#050b0d");
    let track = Color::WHITE.alpha(0.14);
    let tick = Color::WHITE.alpha(0.28);
    // Bezel ring and the dim 270° track.
    s = s.stroke(arc_points(DIAL_CX, DIAL_CY, 57.0, 0.0, 360.0, 72), 2.5, bezel);
    s = s.stroke(arc_points(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START, DIAL_SWEEP, 64), 7.0, track);
    // Ticks every 27°, longer on the halves.
    for i in 0..=10 {
        let a = (DIAL_START + i as f32 * 27.0).to_radians();
        let inner = if i % 5 == 0 { 34.0 } else { 37.0 };
        let (sin, cos) = a.sin_cos();
        s = s.line(
            [DIAL_CX + inner * cos, DIAL_CY + inner * sin],
            [DIAL_CX + 40.0 * cos, DIAL_CY + 40.0 * sin],
            1.0,
            LineCap::Round,
            tick,
        );
    }
    if frac > 0.0 {
        let sweep = DIAL_SWEEP * frac.clamp(0.0, 1.0);
        let arc = arc_points(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START, sweep, 64);
        let c = tone_color(tone, v);
        s = s.stroke(arc.clone(), 11.0, c.alpha(0.28));
        s = s.stroke(arc, 5.0, c);
    }
    s
}

/// The dial element: gauge canvas with `children` centred over it.
pub fn dial(px: f32, frac: f32, tone: &Tone, v: f32, children: Vec<El>) -> El {
    let shape = dial_shape(frac, tone, v);
    let mut overlay = col().absolute(0.0, 0.0).size(px, px).center().gap(0.0);
    for ch in children {
        overlay = overlay.child(ch);
    }
    el()
        .size(px, px)
        .child(canvas(shape).size(px, px))
        .child(overlay)
}

/// The segmented meter: `count` cells lit to `val(slot) / max`, toned by value.
pub fn cells(count: usize, cell_w: f32, cell_h: f32, gap: f32, frac: f32, tone: &Tone, v: f32) -> El {
    let lit = (frac.clamp(0.0, 1.0) * count as f32).ceil() as usize;
    let on = tone_color(tone, v);
    let off = Color::WHITE.alpha(0.12);
    let mut r = row().gap(gap);
    for i in 0..count {
        r = r.child(el().w(cell_w).h(cell_h).radius(1.0).fill(if i < lit { on } else { off }));
    }
    r
}

/// The switch: a 46×22 track with a knob, bound to a 0/1 slot.
pub fn toggle(on: bool, accent: Color, track: Color, knob: Color) -> El {
    let knob_x = if on { 27.0 } else { 3.0 };
    el()
        .w(46.0)
        .h(22.0)
        .radius(11.0)
        .fill(if on { accent.alpha(0.85) } else { track })
        .child(el().absolute(knob_x, 3.0).size(16.0, 16.0).radius(8.0).fill(knob))
}

/// A key cap plate.
pub fn kbd(t: &tok::Theme, legend: &str) -> El {
    row()
        .center()
        .px(5.0)
        .py(1.0)
        .radius(3.0)
        .fill(Color::WHITE.alpha(0.08))
        .border(1.0, Color::WHITE.alpha(0.18))
        .child(text(legend.to_string()).font(text_style(11.0, 500.0, true)).color(t.text))
}

thread_local! {
    /// Leaked `Icon`s keyed by their SVG body, so a spec can name an icon by its
    /// markup and pay the 'static cost once per unique icon.
    static ICONS: RefCell<HashMap<String, &'static Icon>> = RefCell::new(HashMap::new());
}

/// An SVG-body icon at `size` points, tinted `color`.
pub fn glyph(svg: &str, size: f32, c: Color) -> El {
    let icon = ICONS.with(|cache| {
        let mut cache = cache.borrow_mut();
        *cache.entry(svg.to_string()).or_insert_with(|| {
            Box::leak(Box::new(Icon {
                name: "jg",
                view: 24.0,
                body: Box::leak(svg.to_string().into_boxed_str()),
            }))
        })
    });
    rune_icon(icon, size).color(c)
}

/// Text style for a spec text node.
pub fn text_style(size: f32, weight: f32, mono: bool) -> rune::tok::TextStyle {
    let s = rune::tok::TextStyle::new(size, weight);
    if mono { s.mono() } else { s }
}

/// Alignment for a spec text node.
pub fn align_of(a: Option<&str>) -> Align {
    match a {
        Some("center") => Align::Center,
        Some("right") | Some("end") => Align::End,
        _ => Align::Start,
    }
}

/// Upper/lower casing for a spec text node.
pub fn case_of(c: Option<&str>) -> Option<TextCase> {
    match c {
        Some("upper") => Some(TextCase::Uppercase),
        Some("lower") => Some(TextCase::Lowercase),
        _ => None,
    }
}

/// The value a slot holds formatted for display.
pub fn slot_text(slot: usize, decimals: usize) -> String {
    let v = val(slot);
    if decimals == 0 {
        format!("{}", v.round() as i64)
    } else {
        format!("{:.*}", decimals, v)
    }
}

thread_local! {
    static IMAGES: RefCell<Option<rune::ImageCache>> = const { RefCell::new(None) };
    /// Handles kept so a decoded image stays decoded while a tree that shows it is mounted.
    static HELD: RefCell<HashMap<String, rune::Image>> = RefCell::new(HashMap::new());
}

fn with_images<T>(f: impl FnOnce(&rune::ImageCache) -> T) -> T {
    IMAGES.with(|cell| {
        let mut cell = cell.borrow_mut();
        let cache = cell.get_or_insert_with(|| rune::ImageCache::new(std::sync::Arc::new(crate::wake)));
        f(cache)
    })
}

/// The raster size bucket for an image shown `points` wide: the next power of two, so a box
/// that grows a few points does not decode again.
fn bucket(points: f32) -> f32 {
    (points.max(8.0).ceil() as u32).next_power_of_two() as f32
}

/// An image by URL, decoded by the browser and held by this cache.
pub fn image_by_url(url: &str, points: f32) -> rune::Image {
    let size = bucket(points);
    let key = format!("u{size}|{url}");
    HELD.with(|held| held.borrow_mut().entry(key).or_insert_with(|| with_images(|cache| cache.url(url, size, 2.0))).clone())
}

/// Inline SVG markup rasterized to fit `points` square.
pub fn image_of_svg(svg: &str, points: f32) -> rune::Image {
    let size = bucket(points);
    let key = format!("s{size}|{svg}");
    HELD.with(|held| held.borrow_mut().entry(key).or_insert_with(|| with_images(|cache| cache.svg(svg.as_bytes().to_vec(), size, 2.0))).clone())
}

/// Forget every held image (a new tree was mounted; what it shows is requested again).
pub fn release_images() {
    HELD.with(|held| {
        let mut held = held.borrow_mut();
        if held.len() > 512 {
            held.clear();
        }
    });
}
