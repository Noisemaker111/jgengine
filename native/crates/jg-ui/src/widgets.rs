//! Helpers the native builder shares: SVG icons, text styles and the image cache.

use std::cell::RefCell;
use std::collections::HashMap;

use rune::{Align, Color, El, Icon, icon as rune_icon};

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

thread_local! {
    static IMAGES: RefCell<Option<rune::ImageCache>> = const { RefCell::new(None) };
    /// Handles kept so a decoded image stays decoded while a tree that shows it is mounted.
    static HELD: RefCell<HashMap<String, rune::Image>> = RefCell::new(HashMap::new());
    static USED: RefCell<std::collections::HashSet<String>> = RefCell::new(std::collections::HashSet::new());
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
    USED.with(|used| { used.borrow_mut().insert(key.clone()); });
    HELD.with(|held| held.borrow_mut().entry(key).or_insert_with(|| with_images(|cache| cache.url(url, size, 2.0))).clone())
}

pub fn begin_images() {
    USED.with(|used| used.borrow_mut().clear());
}

pub fn finish_images() {
    USED.with(|used| HELD.with(|held| held.borrow_mut().retain(|key, _| used.borrow().contains(key))));
}
