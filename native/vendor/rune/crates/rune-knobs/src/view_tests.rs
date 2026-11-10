use super::*;
use crate::Knob;
use rune::{Cx, Env, Runtime};

struct T {
    knobs: Knobs,
}
const L: Knob = Knob::new("Left size", 0.0, 10.0, 5.0);
const I: Knob = Knob::new("Inner gap", 0.0, 1.0, 0.5);
const R: Knob = Knob::new("Right pad", 0.0, 40.0, 20.0);
const GROUPS: &[Group] = &[Group::new("Left", "left", &[L]), Group::new("Inner", "inner", &[I]), Group::new("Right", "right", &[R])];

fn view(s: &T, _: &mut Cx<T>) -> El {
    el().key("root")
        .w_full()
        .h_full()
        .child(
            row()
                .key("cols")
                .w_full()
                .h_full()
                .child(col().key("left").w(400.0).h_full().child(el().key("inner").w(200.0).h(200.0).mt(100.0).ml(100.0)))
                .child(col().key("right").grow(1.0).h_full()),
        )
        .child(layer(&s.knobs, GROUPS, Style::dark(), |s: &mut T| &mut s.knobs))
}

fn settle(rt: &mut Runtime<T>) {
    for _ in 0..4 {
        rt.frame(1.0 / 60.0);
    }
}

#[test]
fn hover_outlines_the_smallest_region_and_a_click_opens_its_knobs() {
    let mut s = T { knobs: Knobs::default() };
    s.knobs.show();
    s.knobs.pick_region();
    let mut rt = Runtime::new(s, view, (1000.0, 700.0), Env::new(true, 1.0));
    settle(&mut rt);
    for (x, y, want) in [(150.0, 150.0, "Inner"), (50.0, 600.0, "Left"), (600.0, 500.0, "Right")] {
        rt.pointer_move(x, y);
        settle(&mut rt);
        assert_eq!(rt.state.knobs.hover.as_deref(), Some(want), "at {x},{y}");
        assert!(rt.find("knobs-outline").is_some());
    }
    rt.pointer_move(150.0, 150.0);
    settle(&mut rt);
    rt.pointer_down(150.0, 150.0);
    rt.pointer_up(150.0, 150.0);
    settle(&mut rt);
    assert_eq!(rt.state.knobs.group.as_deref(), Some("Inner"));
    assert!(rt.find("knobs-knob-0").is_some());

    let (x, y) = rt.find("knobs-random").unwrap();
    rt.pointer_move(x, y);
    settle(&mut rt);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    settle(&mut rt);
    assert!(rt.state.knobs.values.contains_key("Inner gap"));
    assert!(rt.state.knobs.can_undo());

    let (x, y) = rt.find("knobs-tab-2").unwrap();
    rt.pointer_move(x, y);
    settle(&mut rt);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    settle(&mut rt);
    assert_eq!(rt.state.knobs.group.as_deref(), Some("Right"));
}

fn click(rt: &mut Runtime<T>, key: &str) {
    let (x, y) = rt.find(key).unwrap();
    rt.pointer_move(x, y);
    settle(rt);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    settle(rt);
}
fn press(rt: &mut Runtime<T>, key: rune::Key, shift: bool) {
    let mut ev = rune::KeyEvent { key, mods: Default::default() };
    ev.mods.shift = shift;
    rt.key(ev);
    settle(rt);
}

#[test]
fn opens_on_a_group_and_outlines_only_on_tab_hover() {
    let mut s = T { knobs: Knobs::default() };
    s.knobs.show();
    let mut rt = Runtime::new(s, view, (1000.0, 700.0), Env::new(true, 1.0));
    settle(&mut rt);
    assert!(rt.find("knobs-knob-0").is_some(), "first group is open");
    assert!(rt.find("knobs-outline").is_none());
    let (x, y) = rt.find("knobs-knob-0").unwrap();
    rt.pointer_move(x, y);
    settle(&mut rt);
    assert!(rt.find("knobs-outline").is_none(), "no outline over a knob");
    let (x, y) = rt.find("knobs-tab-1").unwrap();
    rt.pointer_move(x, y);
    settle(&mut rt);
    assert!(rt.find("knobs-outline").is_some());
}

#[test]
fn keyboard_steps_knobs_and_switches_groups() {
    let mut s = T { knobs: Knobs::default() };
    s.knobs.show();
    let mut rt = Runtime::new(s, view, (1000.0, 700.0), Env::new(true, 1.0));
    settle(&mut rt);
    click(&mut rt, "knobs-card");
    let k = |rt: &Runtime<T>| rt.state.knobs.get(&L);
    press(&mut rt, rune::Key::Right, false);
    assert!((k(&rt) - 5.1).abs() < 1e-3, "{}", k(&rt));
    press(&mut rt, rune::Key::Left, true);
    assert!((k(&rt) - 4.1).abs() < 1e-3, "{}", k(&rt));
    press(&mut rt, rune::Key::Tab, false);
    assert_eq!(rt.state.knobs.group.as_deref(), Some("Inner"));
    press(&mut rt, rune::Key::Text("[".into()), false);
    assert_eq!(rt.state.knobs.group.as_deref(), Some("Left"));
    press(&mut rt, rune::Key::Escape, false);
    assert!(!rt.state.knobs.open);
}

#[test]
fn undo_and_reset_are_disabled_until_there_is_something_to_undo() {
    let mut s = T { knobs: Knobs::default() };
    s.knobs.show();
    assert!(!s.knobs.can_undo() && !s.knobs.can_reset(&GROUPS[0]));
    let mut rt = Runtime::new(s, view, (1000.0, 700.0), Env::new(true, 1.0));
    settle(&mut rt);
    click(&mut rt, "knobs-undo");
    click(&mut rt, "knobs-reset");
    assert!(rt.state.knobs.values.is_empty());
    click(&mut rt, "knobs-random");
    assert!(rt.state.knobs.can_undo() && rt.state.knobs.can_reset(&GROUPS[0]));
    click(&mut rt, "knobs-reset");
    assert!(!rt.state.knobs.can_reset(&GROUPS[0]));
}

mod inline_width {
    use super::*;

    const WIDE: Knob = Knob::new("A rather long slider label here", 0.0, 100.0, 50.0).step(1.0);
    const PICK: Knob = Knob::choice("Tint", &["Plain", "Accent", "Raised"], 1);
    const MANY: Knob = Knob::choice(
        "Corner style",
        &["Sharp", "Soft", "Round", "Pill", "Squircle"],
        0,
    );
    const G: &[Group] = &[Group::new("Card", "card", &[L, WIDE, PICK, MANY])];

    struct W {
        knobs: Knobs,
        w: f32,
    }

    fn inline_view(s: &W, _: &mut Cx<W>) -> El {
        row()
            .key("root")
            .w_full()
            .h_full()
            .child(col().key("column").w(s.w).child(inline(
                &s.knobs,
                G,
                Style::dark(),
                |s: &mut W| &mut s.knobs,
                false,
            )))
    }

    fn rects(w: f32) -> Vec<rune::ElementInfo> {
        let mut rt = Runtime::new(
            W {
                knobs: Knobs::default(),
                w,
            },
            inline_view,
            (400.0, 700.0),
            Env::new(true, 1.0),
        );
        for _ in 0..6 {
            rt.frame(1.0 / 60.0);
        }
        rt.elements()
    }

    fn rect(es: &[rune::ElementInfo], key: &str) -> [f32; 4] {
        es.iter()
            .find(|e| e.key.as_deref() == Some(key))
            .unwrap_or_else(|| panic!("no {key}"))
            .rect
    }

    #[test]
    fn rows_stay_inside_the_column_at_240_and_300() {
        for w in [200.0, 240.0, 300.0] {
            let es = rects(w);
            let card = rect(&es, "knobs-card");
            assert!(
                card[0] >= 0.0 && card[0] + card[2] <= w + 0.01,
                "card in {w}: {card:?}"
            );
            for e in es
                .iter()
                .filter(|e| e.path.contains("knobs-card") && e.key.is_some())
            {
                let r = e.rect;
                assert!(
                    r[0] >= card[0] - 0.01 && r[0] + r[2] <= card[0] + card[2] + 0.01,
                    "{:?} at {w}: {r:?} vs {card:?}",
                    e.key
                );
            }
        }
    }

    #[test]
    fn the_slider_track_is_usable_and_grows_with_the_column() {
        let mut last = 0.0;
        for w in [200.0, 240.0, 300.0] {
            let es = rects(w);
            let track = rect(&es, "knobs-knob-0");
            assert!(track[2] > 100.0, "{w}: {track:?}");
            assert!(track[2] > last, "{w}");
            last = track[2];
            let fill = es
                .iter()
                .find(|e| e.path.contains("knobs-knob-0") && e.key.as_deref() == Some("fill"))
                .unwrap()
                .rect;
            assert!(
                (fill[2] - track[2] * 0.5).abs() < 0.6,
                "fill is the value's share of the track at {w}: {fill:?}"
            );
        }
    }

    #[test]
    fn a_choice_that_does_not_fit_beside_its_label_wraps_to_a_grid_when_narrow() {
        let wide = rects(300.0);
        let narrow = rects(200.0);
        assert!(rect(&narrow, "knobs-knob-3")[3] > rect(&wide, "knobs-knob-3")[3] - 0.01);
        assert!(
            rect(&narrow, "knobs-knob-3")[3] > 40.0,
            "the five options sit under their label"
        );
    }

    #[test]
    fn the_floating_panel_keeps_its_300_points() {
        let mut s = T {
            knobs: Knobs::default(),
        };
        s.knobs.show();
        let mut rt = Runtime::new(s, view, (1000.0, 700.0), Env::new(true, 1.0));
        settle(&mut rt);
        let p = rt
            .elements()
            .into_iter()
            .find(|e| e.key.as_deref() == Some("knobs-panel"))
            .unwrap()
            .rect;
        assert_eq!(p[2], 300.0);
    }
}
