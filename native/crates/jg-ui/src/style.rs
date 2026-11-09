//! Applies a spec [`Style`] to a Rune element: fills, gradients, corners,
//! borders, padding, sizing, pins and the per-frame opacity slot.

use rune::{Color, El};

use crate::spec::Style;
use crate::{color, val};

/// Fill/gradient/corners/border first, then padding, then box sizing and
/// placement, then flow. Order matters: each setter only overwrites its own
/// fields, so the most specific spec field must run last within its group.
pub fn apply(e: El, s: &Style) -> El {
    let e = paint(e, s);
    let e = pad(e, s);
    let e = size(e, s);
    let e = place(e, s);
    flow(e, s)
}

fn paint(mut e: El, s: &Style) -> El {
    match (&s.fill_top, &s.fill_bottom) {
        (Some(top), Some(bottom)) => e = e.gradient(color(top), color(bottom)),
        _ => {
            if let Some(f) = &s.fill {
                e = e.fill(color(f));
            }
        }
    }
    if let Some(r) = s.radius {
        e = e.radius(r);
    }
    if let Some(w) = s.border {
        e = e.border(w, s.border_color.as_deref().map(color).unwrap_or(Color::WHITE.alpha(0.2)));
    }
    e
}

fn pad(mut e: El, s: &Style) -> El {
    if let Some(p) = s.pad {
        e = e.padding(p);
    }
    if let Some(p) = s.px {
        e = e.px(p);
    }
    if let Some(p) = s.py {
        e = e.py(p);
    }
    if let Some(p) = s.pt {
        e = e.pt(p);
    }
    if let Some(p) = s.pb {
        e = e.pb(p);
    }
    if let Some(p) = s.pl {
        e = e.pl(p);
    }
    if let Some(p) = s.pr {
        e = e.pr(p);
    }
    e
}

fn size(mut e: El, s: &Style) -> El {
    if let Some(w) = s.w {
        e = e.w(w);
    }
    if let Some(h) = s.h {
        e = e.h(h);
    }
    if let Some(h) = s.min_h {
        e = e.min_h(h);
    }
    if let Some(h) = s.max_h {
        e = e.max_h(h);
    }
    if s.w_full {
        e = e.w_full();
    }
    if s.h_full {
        e = e.h_full();
    }
    if let Some(g) = s.grow {
        e = e.grow(g);
    }
    if s.shrink == Some(true) {
        e = e.shrink();
    }
    e
}

fn place(mut e: El, s: &Style) -> El {
    if let Some([l, t]) = s.abs {
        e = e.absolute(l, t);
    }
    if let Some([l, t, r, b]) = s.pin {
        e = e.pin(l, t, r, b);
    }
    if let Some(slot) = s.opacity {
        e = e.opacity(val(slot).clamp(0.0, 1.0));
    }
    e
}

fn flow(mut e: El, s: &Style) -> El {
    match s.justify.as_deref() {
        Some("center") => e = e.justify_center(),
        Some("end") => e = e.justify_end(),
        Some("between") => e = e.justify_between(),
        Some("evenly") => e = e.justify_evenly(),
        _ => {}
    }
    match s.items.as_deref() {
        Some("center") => e = e.items_center(),
        Some("end") => e = e.items_end(),
        Some("stretch") => e = e.items_stretch(),
        _ => {}
    }
    if let Some(g) = s.gap {
        e = e.gap(g);
    }
    e
}
