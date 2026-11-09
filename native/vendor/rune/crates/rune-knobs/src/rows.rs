//! The rows every panel shares (the side panel, the floating one, a storybook's column): a
//! group's preset tray and its card of knobs. Rows lay out for the card width they're given.

use rune::{Color, Drag, El, Phase, TextStyle, Tx, col, el, row, spacer, text};

use crate::{DEFAULT, Group, Knob, Knobs, Style};

pub(crate) const PAD: f32 = 10.0;
pub(crate) const ROW: f32 = 32.0;

pub(crate) const LABEL: TextStyle = TextStyle::new(12.0, 450.0).lh(16.0);
pub(crate) const VALUE: TextStyle = TextStyle::new(11.5, 450.0).lh(16.0).features("'tnum' 1");
pub(crate) const TITLE: TextStyle = TextStyle::new(13.0, 600.0).lh(18.0).tracking(-0.13);
pub(crate) const CHIP: TextStyle = TextStyle::new(12.0, 500.0).lh(16.0);
const CHIP_ON: TextStyle = TextStyle::new(12.0, 600.0).lh(16.0);
/// The number key over each option of the keyboard's choice.
const DIGIT: TextStyle = TextStyle::new(8.5, 600.0).lh(10.0).features("'tnum' 1");

/// More options than this get a stepper, with the whole list a click away.
const LONG: usize = 10;
/// Option cells: their padding, the gap between them and the well's inset.
const OPT_PAD: f32 = 7.0;
const OPT_GAP: f32 = 2.0;
const WELL: f32 = 2.0;

/// How wide `s` sets in `style`.
fn text_w(s: &str, style: TextStyle) -> f32 {
    rune::text::measure(s, &[], style, None).0
}

/// What the rows need: the knobs, the look, the way back to the app's `Knobs`, and the card's
/// width.
pub(crate) struct Ctx<'a, S> {
    pub k: &'a Knobs,
    pub st: Style,
    pub lens: fn(&mut S) -> &mut Knobs,
    pub w: f32,
}

impl<S> Clone for Ctx<'_, S> {
    fn clone(&self) -> Self {
        *self
    }
}
impl<S> Copy for Ctx<'_, S> {}

/// Which knob a row is: its group's name and index among the groups, and its own index.
#[derive(Clone, Copy)]
struct Id {
    group: &'static str,
    g: usize,
    i: usize,
}

/// Using a knob makes it the panel's group and the keyboard's knob.
fn touch(k: &mut Knobs, id: Id) {
    if k.group.as_deref() != Some(id.group) {
        k.group = Some(id.group.to_owned());
    }
    k.cursor = id.i;
    k.at = Some(crate::tree::Node::Knob(id.g, id.i));
    k.kbd = true;
}

/// Hovering a knob shows what it does under the side panel; right-clicking it puts it back to
/// its default.
fn hovers<S: 'static>(e: El, lens: fn(&mut S) -> &mut Knobs, id: Id, d: Knob) -> El {
    let name = d.name;
    e.on_secondary_press(move |s: &mut S, _, tx: &mut Tx| {
        tx.instant();
        let k = lens(s);
        touch(k, id);
        k.reset_knob(&d);
    })
    .on_hover_change(move |s: &mut S, inside, tx: &mut Tx| {
        tx.instant();
        let k = lens(s);
        if inside {
            k.hot = Some(name.to_owned());
        } else if k.hot.as_deref() == Some(name) {
            k.hot = None;
        }
    })
}

/// Knobs `show` of `g` (group `gi` of the panel's) on one card; `mark` is the keyboard's knob.
pub(crate) fn card<S: 'static>(mut cx: Ctx<'_, S>, g: &Group, gi: usize, show: &[usize], mark: Option<usize>) -> El {
    // The rows that choose a layout by width (a choice: beside its label, or a grid) read the
    // card's laid-out width; `cx.w` is where the first frame starts. The read is rounded, so
    // only a real resize rebuilds.
    if let Some(w) = rune::memo::layout_with("knobs-card", |r| r[2].round()) {
        cx.w = w;
    }
    let mut card = col().key("knobs-card").w_full().radius(8.0).fill(cx.st.fill).clip_rounded(8.0);
    for (n, &i) in show.iter().enumerate() {
        let d = &g.knobs[i];
        let id = Id { group: g.name, g: gi, i };
        let mut r = if d.labels.is_empty() { slider(cx, id, *d) } else { choice(cx, id, *d) };
        if mark == Some(i) {
            r = r.fill(cx.st.fill_hover);
        }
        if n > 0 {
            r = r.child(el().key("rule").absolute(0.0, 0.0).w_full().h(0.5).fill(cx.st.rule));
        }
        card = card.child(r);
    }
    card
}

pub(crate) fn presets<S: 'static>(cx: Ctx<'_, S>, g: &Group) -> El {
    let (k, st, lens) = (cx.k, cx.st, cx.lens);
    let active = k.active(g);
    let names: Vec<(String, bool)> = std::iter::once((DEFAULT.to_owned(), false))
        .chain(g.presets.iter().map(|p| (p.name.to_owned(), false)))
        .chain(k.saved.get(g.name).into_iter().flatten().map(|(n, _)| (n.clone(), true)))
        .collect();
    let mut tray = row().key("knobs-presets").w_full().flex_wrap().gap(2.0).padding(2.0).radius(8.0).fill(st.inset);
    for (i, (name, saved)) in names.into_iter().enumerate() {
        let on = name == active;
        let drifted = on && k.drifted(g, &name);
        let (g1, g2, n1, n2) = (*g, *g, name.clone(), name.clone());
        let shown = if name == DEFAULT { g.default_label.to_owned() } else { name };
        let mut chip = row()
            .key(format!("knobs-preset-{i}"))
            .role("button")
            .label(shown.clone())
            .grow(1.0)
            .min_w(52.0)
            .h(24.0)
            .px(8.0)
            .gap(5.0)
            .center()
            .radius(6.0)
            .fill(if on { st.raised } else { Color::TRANSPARENT })
            .hover(st.fill_hover)
            .on_press_tx(move |s: &mut S, tx: &mut Tx| {
                tx.instant();
                lens(s).apply(&g1, &n1);
            })
            .child(text(shown).font(if on { CHIP_ON } else { CHIP }).color(if on { st.fg } else { st.fg2 }));
        if drifted {
            chip = chip.child(el().key("drift").w(4.0).h(4.0).radius(2.0).fill(st.fg3));
        }
        if saved {
            chip = chip.help("Right-click to delete").on_secondary_press(move |s: &mut S, _, tx: &mut Tx| {
                tx.instant();
                lens(s).delete(&g2, &n2);
            });
        }
        tray = tray.child(chip);
    }
    let g = *g;
    tray.child(
        row()
            .key("knobs-save")
            .role("button")
            .label("Save preset")
            .help("Save preset")
            .w(28.0)
            .h(24.0)
            .center()
            .radius(6.0)
            .hover(st.fill_hover)
            .on_press_tx(move |s: &mut S, tx: &mut Tx| {
                tx.instant();
                lens(s).save(&g);
            })
            .child(text("+").font(TITLE).color(st.fg3)),
    )
}

fn readout(d: &Knob, v: f32) -> String {
    let span = d.max - d.min;
    if d.step >= 1.0 || span > 20.0 {
        format!("{v:.0}")
    } else if span > 2.0 {
        format!("{v:.1}")
    } else {
        format!("{v:.2}")
    }
}

fn slider<S: 'static>(cx: Ctx<'_, S>, id: Id, d: Knob) -> El {
    let i = id.i;
    let (k, st, lens) = (cx.k, cx.st, cx.lens);
    let v = k.get(&d);
    let frac = if d.max > d.min { (v - d.min) / (d.max - d.min) } else { 0.0 };
    let hot = k.hot.as_deref() == Some(d.name);
    let held = k.drag.as_deref() == Some(d.name);
    let changed = (v - d.default).abs() > 1e-4;
    let tint = if held { st.slider_active } else if hot { st.slider_hover } else { st.slider };
    hovers(el().key(format!("knobs-knob-{i}")).role("slider").label(d.title()).w_full().h(ROW).fill(if hot || held { st.fill_hover } else { Color::TRANSPARENT }), lens, id, d)
        .on_drag(move |s: &mut S, g: &mut Drag, tx: &mut Tx| {
            tx.instant();
            let k = lens(s);
            let span = d.max - d.min;
            match g.phase {
                Phase::Down => {
                    k.checkpoint();
                    touch(k, id);
                    g.data = k.get(&d);
                    k.drag = Some(d.name.to_owned());
                }
                Phase::Move => k.set(&d, g.data + g.dx / g.w.max(1.0) * span),
                Phase::Up => {
                    if g.cancelled() {
                        k.set(&d, g.data);
                    } else if g.dx.abs() < 2.0 && g.dy.abs() < 2.0 {
                        k.set(&d, d.min + (g.x / g.w.max(1.0)).clamp(0.0, 1.0) * span);
                    }
                    if k.undo.last() == Some(&k.values) {
                        k.undo.pop();
                    }
                    k.drag = None;
                }
            }
        })
        .child(
            row().key("fill").absolute(0.0, 0.0).w_frac(frac).h(ROW).fill(tint).child(spacer()).child(
                el().key("handle")
                    .w(3.0)
                    .min_w(3.0)
                    .h(ROW - 12.0)
                    .mt(6.0)
                    .radius(1.5)
                    .fill(st.handle)
                    .opacity(if held { 0.95 } else if hot { 0.65 } else { 0.0 }),
            ),
        )
        .child(
            row()
                .key("text")
                .absolute(0.0, 0.0)
                .w_full()
                .h(ROW)
                .px(PAD)
                .gap(8.0)
                .center_y()
                .child(text(d.title()).font(LABEL).color(st.fg2).truncate_fade().shrink())
                .child(spacer())
                .child(text(readout(&d, v)).font(VALUE).color(if hot || held || changed { st.fg } else { st.fg2 })),
        )
}

/// How a choice lays out at a card width.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Shape {
    /// The options beside the label.
    Inline,
    /// The label over a grid of equal cells, `cols` across.
    Grid { cols: usize },
    /// The label and a stepper over the current option; the grid shows when expanded.
    Long { cols: usize },
}

/// The narrowest cell that fits every option, the settled dot included.
fn cell_w(d: &Knob, dot: bool) -> f32 {
    d.labels.iter().map(|l| text_w(l, CHIP_ON)).fold(0.0, f32::max) + 2.0 * OPT_PAD + if dot { 9.0 } else { 0.0 }
}

/// Columns for `n` cells of at least `cell` in `room`, balanced so the rows come out even
/// (six options in rows of three, not four and two).
fn columns(n: usize, cell: f32, room: f32) -> usize {
    let fit = (((room - 2.0 * WELL + OPT_GAP) / (cell + OPT_GAP)).floor() as usize).clamp(1, n.max(1));
    let rows = n.div_ceil(fit);
    n.div_ceil(rows)
}

pub(crate) fn shape(d: &Knob, w: f32, dot: bool) -> Shape {
    let n = d.labels.len();
    let inline_need: f32 = d.labels.iter().map(|l| text_w(l, CHIP_ON) + 2.0 * OPT_PAD).sum::<f32>() + OPT_GAP * (n.saturating_sub(1)) as f32 + 2.0 * WELL + if dot { 9.0 } else { 0.0 };
    if inline_need + text_w(d.title(), LABEL) + 2.0 * PAD + 16.0 <= w {
        return Shape::Inline;
    }
    let cols = columns(n, cell_w(d, dot), w - 2.0 * (PAD - 6.0));
    if n > LONG { Shape::Long { cols } } else { Shape::Grid { cols } }
}

fn choice<S: 'static>(cx: Ctx<'_, S>, id: Id, d: Knob) -> El {
    let lens = cx.lens;
    // A click anywhere on the row, not only on an option, puts the keyboard on it for ←→.
    hovers(choice_row(cx, id, d), lens, id, d).on_press_tx(move |s: &mut S, tx: &mut Tx| {
        tx.instant();
        touch(lens(s), id);
    })
}

fn choice_row<S: 'static>(cx: Ctx<'_, S>, id: Id, d: Knob) -> El {
    let i = id.i;
    let (k, st, lens, w) = (cx.k, cx.st, cx.lens, cx.w);
    let at = k.get(&d).round() as usize;
    let settled = k.settled.as_ref().and_then(|m| m.get(d.name)).map(|v| d.clamp(*v).round() as usize);
    let shape = shape(&d, w, settled.is_some());
    // The keyboard's choice numbers its options for 1–9, in the chip's left padding so nothing moves.
    let keyed = k.at() == Some(crate::tree::Node::Knob(id.g, id.i));
    let option = |j: usize, label: &'static str, cell: Option<f32>| {
        let on = j == at;
        let mut o = row()
            .key(format!("opt-{j}"))
            .role("button")
            .label(label)
            .h(22.0)
            .px(OPT_PAD)
            .gap(5.0)
            .center()
            .radius(5.0)
            .fill(if on { st.raised } else { Color::TRANSPARENT })
            .hover(st.fill_hover)
            .on_hover_change(move |s: &mut S, inside, tx: &mut Tx| {
                tx.instant();
                let k = lens(s);
                if inside {
                    k.hot = Some(d.name.to_owned());
                    k.hot_opt = Some((d.name.to_owned(), j));
                } else if k.hot_opt.as_ref().is_some_and(|(n, o)| *n == d.name && *o == j) {
                    k.hot_opt = None;
                }
            })
            .on_press_tx(move |s: &mut S, tx: &mut Tx| {
                tx.instant();
                let k = lens(s);
                k.checkpoint();
                touch(k, id);
                k.set(&d, j as f32);
            })
            .child(text(label).font(CHIP).color(if on { st.fg } else { st.fg2 }).truncate_fade().shrink())
            .children((settled == Some(j)).then(|| el().key("current").w(4.0).h(4.0).radius(2.0).fill(st.fg3)))
            .children((keyed && j < 9).then(|| text((j + 1).to_string()).key("digit").font(DIGIT).color(st.fg3).absolute(1.5, 1.5)));
        if let Some(cw) = cell {
            o = o.w(cw);
        }
        o
    };
    let grid = |cols: usize| {
        let room = w - 2.0 * (PAD - 6.0) - 2.0 * WELL;
        let cw = (room - OPT_GAP * (cols - 1) as f32) / cols as f32;
        let mut g = col().key("seg").w_full().padding(WELL).gap(OPT_GAP).radius(7.0).fill(st.inset);
        for (r, chunk) in d.labels.chunks(cols).enumerate() {
            let mut line = row().key(format!("line-{r}")).gap(OPT_GAP);
            for (c, label) in chunk.iter().enumerate() {
                line = line.child(option(r * cols + c, label, Some(cw)));
            }
            g = g.child(line);
        }
        g
    };
    let title = text(d.title()).font(LABEL).color(st.fg2).truncate_fade().shrink();
    match shape {
        Shape::Inline => {
            let mut seg = row().key("seg").h(26.0).padding(WELL).gap(OPT_GAP).radius(7.0).fill(st.inset);
            for (j, label) in d.labels.iter().enumerate() {
                seg = seg.child(option(j, label, None));
            }
            row().key(format!("knobs-knob-{i}")).w_full().h(ROW + 4.0).pl(PAD).pr(PAD - 4.0).gap(8.0).center_y().child(title).child(spacer()).child(seg)
        }
        Shape::Grid { cols } => col().key(format!("knobs-knob-{i}")).w_full().px(PAD - 6.0).pb(6.0).child(row().key("head").w_full().h(ROW - 4.0).px(6.0).center_y().child(title)).child(grid(cols)),
        Shape::Long { cols } => {
            let open = k.expanded.as_deref() == Some(d.name);
            let n = d.labels.len();
            let step = move |by: i32| {
                move |s: &mut S, tx: &mut Tx| {
                    tx.instant();
                    let k = lens(s);
                    let at = k.get(&d).round() as i32;
                    k.checkpoint();
                    touch(k, id);
                    k.set(&d, (at + by).rem_euclid(n as i32) as f32);
                }
            };
            let arrow = |key: &str, glyph: &'static str, by: i32| {
                row().key(key).role("button").label(if by < 0 { "Previous" } else { "Next" }).w(22.0).h(22.0).center().radius(5.0).hover(st.fill_hover).on_press_tx(step(by)).child(text(glyph).font(CHIP).color(st.fg2))
            };
            let name = d.name;
            let current = row()
                .key("current")
                .role("button")
                .label("Show all options")
                .help("Show all options")
                .h(22.0)
                .px(8.0)
                .gap(6.0)
                .center()
                .radius(5.0)
                .fill(if open { st.raised } else { Color::TRANSPARENT })
                .hover(st.fill_hover)
                .on_press_tx(move |s: &mut S, tx: &mut Tx| {
                    tx.instant();
                    let k = lens(s);
                    k.expanded = if k.expanded.as_deref() == Some(name) { None } else { Some(name.to_owned()) };
                })
                .child(text(d.labels.get(at).copied().unwrap_or("")).font(CHIP).color(st.fg))
                .child(text(format!("{}/{n}", at + 1)).font(VALUE).color(st.fg3));
            let stepper = row().key("stepper").h(26.0).padding(WELL).gap(OPT_GAP).center_y().radius(7.0).fill(st.inset).child(arrow("prev", "‹", -1)).child(current).child(arrow("next", "›", 1));
            let head = row().key("head").w_full().h(ROW + 4.0).pl(6.0).gap(8.0).center_y().child(title).child(spacer()).child(stepper);
            let c = col().key(format!("knobs-knob-{i}")).w_full().px(PAD - 6.0).child(head);
            if open { c.pb(6.0).child(grid(cols)) } else { c }
        }
    }
}
