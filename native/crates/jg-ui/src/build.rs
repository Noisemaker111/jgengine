//! Builds the Rune element tree when the spec or shared values change. CSS
//! branches reuse Rune's retained subtrees until their own dependencies change.

use rune::tok::{self, Theme};
use rune::{Color, El, ScrollSpec, TextEdit, TextStyle, Tx, col, el, row, text, text_input};

use crate::spec::{Node, Style};
use crate::style::apply;
use crate::widgets;
use crate::{Ui, color, set_val, val};

/// The root element: a full-viewport box the spec's top-level nodes position
/// inside (absolute, pinned or flowed).
pub fn view(s: &Ui, cx: &mut rune::Cx<Ui>) -> El {
    s.rendered_revision.set(s.revision);
    s.rendered_page_revision.set(s.page_revision);
    let structure_changed = s.cache.prepare(&s.root, s.revision);
    if structure_changed { widgets::begin_images(); }
    let t = tok::theme(cx.system_dark());
    let mut e = el().w_full().h_full().key("root");
    for (i, n) in s.root.iter().enumerate() {
        e = e.child(build(n, &i.to_string(), s, &t));
    }
    if structure_changed { widgets::finish_images(); }
    e
}

fn stack(children: &[Node], horizontal: bool, style: &Style, s: &Ui, t: &Theme, path: &str) -> El {
    let mut e = apply(if horizontal { row() } else { col() }, style);
    for (i, n) in children.iter().enumerate() {
        e = e.child(build(n, &format!("{path}.{i}"), s, t));
    }
    e
}

fn text_el(body: String, n_size: Option<f32>, weight: Option<f32>, mono: bool, c: Color, case: Option<&str>, align: Option<&str>, tracking: Option<f32>, opacity: Option<usize>) -> El {
    let mut e = text(body).font(TextStyle {
        tracking: tracking.unwrap_or(0.0),
        ..widgets::text_style(n_size.unwrap_or(13.0), weight.unwrap_or(400.0), mono)
    });
    if let Some(tc) = widgets::case_of(case) {
        e = e.text_case(tc);
    }
    e = e.align(widgets::align_of(align));
    if let Some(slot) = opacity {
        e = e.opacity(val(slot).clamp(0.0, 1.0));
    }
    let _ = c;
    e.color(c)
}

pub(crate) fn build(n: &Node, path: &str, s: &Ui, t: &Theme) -> El {
    match n {
        Node::Native(element) => crate::native::build(element, s.revision),
        Node::X(b) => crate::css::build(b, path, s, t),
        Node::Panel { children, style } => stack(children, false, style, s, t, path).key(path.to_string()),
        Node::Row { children, style } => stack(children, true, style, s, t, path).key(path.to_string()),
        Node::Scroll { children, style } => {
            let mut e = apply(col().scroll(ScrollSpec { stick_bottom: false }).hit(), style);
            let mut inner = col();
            if let Some(g) = style.gap {
                inner = inner.gap(g);
            }
            for (i, ch) in children.iter().enumerate() {
                inner = inner.child(build(ch, &format!("{path}.{i}"), s, t));
            }
            e = e.child(inner);
            e.key(path.to_string())
        }
        Node::Text {
            text: txt,
            slot,
            decimals,
            prefix,
            suffix,
            label,
            size,
            weight,
            mono,
            color: hex,
            case,
            align,
            tracking,
            tone,
            opacity,
        } => {
            let mut body = match slot {
                Some(k) => widgets::slot_text(*k, decimals.unwrap_or(0)),
                None => txt.clone(),
            };
            if let Some(p) = prefix {
                body = format!("{p}{body}");
            }
            if let Some(sx) = suffix {
                body = format!("{body}{sx}");
            }
            let c = match (tone, slot) {
                (Some(tone), Some(k)) => widgets::tone_color(tone, val(*k)),
                _ => hex.as_deref().map(color).unwrap_or(t.text),
            };
            let e = text_el(body, *size, *weight, *mono, c, case.as_deref(), align.as_deref(), *tracking, *opacity);
            let e = match label {
                Some(l) => row()
                    .gap(6.0)
                    .center_y()
                    .child(text(l.clone()).font(widgets::text_style(11.0, 600.0, false)).color(t.text_secondary))
                    .child(e),
                None => e,
            };
            e.key(path.to_string())
        }
        Node::Cells { slot, max, count, tone, cell_w, cell_h, gap } => widgets::cells(
            *count,
            cell_w.unwrap_or(8.0),
            cell_h.unwrap_or(14.0),
            gap.unwrap_or(2.0),
            val(*slot) / *max,
            tone,
            val(*slot),
        )
        .key(path.to_string()),
        Node::Dial { slot, max, size, tone, children } => {
            let v = val(*slot);
            let frac = v / *max;
            let mut parts = Vec::with_capacity(children.len());
            for (i, ch) in children.iter().enumerate() {
                parts.push(build(ch, &format!("{path}.{i}"), s, t));
            }
            widgets::dial(*size, frac, tone, v, parts).key(path.to_string())
        }
        Node::Button { id, label, hint, active, disabled, color: accent_hex, style } => {
            let id_key = id.clone();
            let id_emit = id.clone();
            let is_active = active.map(|k| val(k) >= 0.5).unwrap_or(false);
            let accent = accent_hex.as_deref().map(color).unwrap_or_else(|| color("#e2bd6e"));
            let (fill_c, text_c, border_c) = if *disabled {
                (t.control_track, t.text_secondary, None)
            } else if is_active {
                (accent, color("#17120a"), Some(accent))
            } else {
                (t.control_off, t.text, None)
            };
            let mut e = apply(
                col()
                    .center()
                    .px(14.0)
                    .h(36.0)
                    .radius(8.0)
                    .fill(fill_c),
                style,
            );
            if let Some(bc) = border_c {
                e = e.border(1.5, bc);
            }
            e = e.child(text(label.clone()).font(widgets::text_style(14.0, 600.0, false)).color(text_c));
            if let Some(h) = hint {
                e = e.child(text(h.clone()).font(widgets::text_style(11.0, 500.0, false)).color(t.text_secondary));
            }
            if !disabled {
                e = e.hit().on_press(move |_: &mut Ui| {
                    emit_press(&id_emit);
                });
            } else {
                e = e.hit();
            }
            e.key(format!("btn-{id_key}"))
        }
        Node::Field { id, placeholder, mono, style, .. } => {
            let id_edit = id.clone();
            let id_emit = id.clone();
            let edit = s.edits.get(id.as_str()).unwrap_or(&s.empty_edit);
            let mut e = text_input(edit, widgets::text_style(14.0, 500.0, *mono))
                .w_full()
                .h(36.0)
                .px(10.0)
                .radius(8.0)
                .fill(t.card)
                .border(1.0, t.card_border)
                .placeholder(placeholder.clone(), t.text_secondary)
                .single_line()
                .hit();
            e = apply(e, style);
            e = e
                .on_edit(move |s: &mut Ui| -> &mut TextEdit {
                    s.edits.get_mut(id_edit.as_str()).unwrap_or(&mut s.empty_edit)
                })
                .on_submit(move |s: &mut Ui, _tx: &mut Tx| {
                    let text_now = s.edits.get(id_emit.as_str()).map(|e| e.text.clone());
                    crate::emit(&id_emit, "submit", None, text_now);
                });
            e.key(format!("field-{id}"))
        }
        Node::Slider { id, slot, w, color: accent_hex } => {
            let id_emit = id.clone();
            let slot = *slot;
            let frac = val(slot).clamp(0.0, 1.0);
            let track_w = w.unwrap_or(200.0);
            let accent = accent_hex.as_deref().map(color).unwrap_or(t.indicator);
            let fill_w = (track_w * frac).max(6.0);
            row()
                .key(format!("slider-{}-{path}", id))
                .w(track_w)
                .h(24.0)
                .center_y()
                .child(
                    el()
                        .w(track_w)
                        .h(6.0)
                        .radius(3.0)
                        .fill(t.control_track)
                        .child(el().w(fill_w).h_full().radius(3.0).fill(accent)),
                )
                .child(el().w(14.0).h(14.0).radius(7.0).fill(t.text))
                .hit()
                .on_drag(move |_: &mut Ui, d: &mut rune::Drag, _tx: &mut Tx| {
                    let f = (d.x / d.w.max(1.0)).clamp(0.0, 1.0);
                    set_val(slot, f);
                    if !matches!(d.phase, rune::Phase::Move) {
                        crate::emit(&id_emit, "slider", Some(f), None);
                    }
                })
        }
        Node::Toggle { id, slot, label, style } => {
            let id_emit = id.clone();
            let slot = *slot;
            let on = val(slot) >= 0.5;
            let mut e = row().gap(10.0).center_y().hit();
            if let Some(l) = label {
                e = e.child(text(l.clone()).font(widgets::text_style(13.0, 500.0, false)).color(t.text));
            }
            e = e.child(widgets::toggle(on, t.indicator, t.control_track, t.text));
            e = apply(e, style);
            e = e.on_press(move |s: &mut Ui| {
                let now = val(slot) < 0.5;
                set_val(slot, if now { 1.0 } else { 0.0 });
                crate::emit(&id_emit, "toggle", Some(if now { 1.0 } else { 0.0 }), None);
                let _ = s;
            });
            e.key(format!("toggle-{id}"))
        }
        Node::Select { id, options, slot, label } => {
            let id_emit = id.clone();
            let options = options.clone();
            let slot = *slot;
            let idx = (val(slot).round() as usize).min(options.len().saturating_sub(1));
            let current = options.get(idx).cloned().unwrap_or_default();
            let mut e = row().gap(8.0).center_y().hit();
            if let Some(l) = label {
                e = e.child(text(l.clone()).font(widgets::text_style(13.0, 500.0, false)).color(t.text_secondary));
            }
            e = e
                .child(text(format!("{current}  ›")).font(widgets::text_style(13.0, 600.0, false)).color(t.text))
                .on_press(move |_: &mut Ui| {
                    let n = options.len();
                    if n == 0 {
                        return;
                    }
                    let next = ((val(slot).round() as usize) + 1) % n;
                    set_val(slot, next as f32);
                    crate::emit(&id_emit, "select", Some(next as f32), None);
                });
            e.key(format!("select-{id}"))
        }
        Node::Bar { slot, max, h, color: accent_hex, track } => {
            let frac = (val(*slot) / *max).clamp(0.0, 1.0);
            let hh = h.unwrap_or(8.0);
            el()
                .key(format!("bar-{path}"))
                .w_full()
                .h(hh)
                .radius(hh / 2.0)
                .fill(track.as_deref().map(color).unwrap_or(t.control_track))
                .child(el().h_full().w_frac(frac.max(0.001)).radius(hh / 2.0).fill(accent_hex.as_deref().map(color).unwrap_or(t.indicator)))
        }
        Node::Gap { size } => el().w(*size).h(*size).key(path.to_string()),
        Node::Kbd { text: legend } => widgets::kbd(t, legend).key(path.to_string()),
        Node::Icon { svg, size, color: hex } => widgets::glyph(svg, size.unwrap_or(16.0), hex.as_deref().map(color).unwrap_or(t.text)).key(path.to_string()),
        Node::Line { color: hex, h } => el()
            .key(path.to_string())
            .w_full()
            .h(h.unwrap_or(1.0))
            .fill(hex.as_deref().map(color).unwrap_or(Color::WHITE.alpha(0.15))),
    }
}

fn emit_press(id: &str) {
    crate::emit(id, "press", None, None);
}
