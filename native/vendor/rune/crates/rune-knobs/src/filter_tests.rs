//! The filter is a real single-line field: editing keys are its own while it edits, and the
//! panel's keys come back when it stops.
use rune::{Cx, Env, Key, KeyEvent, Mods, Runtime};

use super::*;
use crate::Knob;

struct T {
    knobs: Knobs,
}
const L: Knob = Knob::new("Left size", 0.0, 10.0, 5.0).label("Left column size");
const R: Knob = Knob::new("Right pad", 0.0, 40.0, 20.0).step(1.0);
const G: Knob = Knob::new("Right gap", 0.0, 40.0, 10.0).step(1.0);
const GROUPS: &[Group] = &[Group::new("Left", "left", &[L]), Group::new("Right", "right", &[R, G])];

fn view(s: &T, _: &mut Cx<T>) -> El {
    let page = row().key("cols").w_full().h_full().child(col().key("left").w(300.0).h_full()).child(col().key("right").grow(1.0).h_full());
    side(page, &s.knobs, GROUPS, Style::dark(), |s: &mut T| &mut s.knobs)
}

fn settle(rt: &mut Runtime<T>) {
    for _ in 0..40 {
        rt.frame(1.0 / 60.0);
    }
}

fn press(rt: &mut Runtime<T>, key: Key, mods: Mods) {
    rt.key(KeyEvent { key, mods });
    settle(rt);
}
fn tap(rt: &mut Runtime<T>, key: Key) {
    press(rt, key, Mods::default());
}
fn type_str(rt: &mut Runtime<T>, s: &str) {
    for c in s.chars() {
        tap(rt, Key::Text(c.to_string()));
    }
}
fn cmd(c: char) -> (Key, Mods) {
    (Key::Command(c), Mods { cmd: true, ..Mods::default() })
}

/// An open panel with the keyboard in it, the filter editing.
fn editing() -> Runtime<T> {
    let mut s = T { knobs: Knobs::default() };
    s.knobs.show();
    s.knobs.set_folded("Right", false);
    let mut rt = Runtime::new(s, view, (1000.0, 700.0), Env::new(true, 1.0));
    settle(&mut rt);
    let (x, y) = rt.find("knobs-filter").unwrap();
    rt.pointer_move(x, y);
    settle(&mut rt);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    settle(&mut rt);
    assert!(rt.state.knobs.filtering, "a click starts filtering");
    rt
}

/// The panel focused with the filter idle, the keyboard on Right pad.
fn idle() -> Runtime<T> {
    let mut rt = editing();
    type_str(&mut rt, "right");
    tap(&mut rt, Key::Escape);
    rt
}

fn caret(rt: &Runtime<T>) -> (usize, usize) {
    rt.state.knobs.edit().range()
}

#[test]
fn typing_filters_and_the_caret_moves_without_stepping_a_knob() {
    let mut rt = editing();
    assert!(rt.find("knobs-filter-input").is_some() && rt.state.knobs.edit().focused);
    type_str(&mut rt, "rigt");
    assert_eq!(rt.state.knobs.query, "rigt");
    tap(&mut rt, Key::Left);
    assert_eq!(caret(&rt), (3, 3), "← moves the caret");
    type_str(&mut rt, "h");
    assert_eq!(rt.state.knobs.query, "right");
    assert_eq!(rt.state.knobs.at(), Some(Node::Knob(1, 0)), "the keyboard is on the first match");
    let before = rt.state.knobs.clone();
    tap(&mut rt, Key::Right);
    tap(&mut rt, Key::Left);
    tap(&mut rt, Key::Left);
    assert_eq!(rt.state.knobs.values, before.values, "← → step no knob");
    assert_eq!((rt.state.knobs.folded.clone(), rt.state.knobs.unfolded.clone()), (before.folded, before.unfolded), "and fold nothing");
    press(&mut rt, Key::Left, Mods { shift: true, ..Mods::default() });
    assert_eq!(caret(&rt), (2, 3), "⇧← extends the selection");
}

#[test]
fn select_all_then_typing_replaces_the_query() {
    let mut rt = editing();
    type_str(&mut rt, "right");
    let (k, m) = cmd('a');
    press(&mut rt, k, m);
    assert_eq!(caret(&rt), (0, 5));
    type_str(&mut rt, "left");
    assert_eq!(rt.state.knobs.query, "left");
}

#[test]
fn word_and_line_deletes_and_paste_work() {
    let mut rt = editing();
    type_str(&mut rt, "right pad");
    press(&mut rt, Key::Backspace, Mods { alt: true, ..Mods::default() });
    assert_eq!(rt.state.knobs.query, "right ");
    press(&mut rt, Key::Left, Mods { alt: true, ..Mods::default() });
    assert_eq!(caret(&rt), (0, 0), "⌥← jumps a word");
    press(&mut rt, Key::Right, Mods { cmd: true, ..Mods::default() });
    assert_eq!(caret(&rt), (6, 6), "⌘→ goes to the end");
    press(&mut rt, Key::Backspace, Mods { cmd: true, ..Mods::default() });
    assert_eq!(rt.state.knobs.query, "");
    rt.paste("gap");
    settle(&mut rt);
    assert_eq!(rt.state.knobs.query, "gap");
    type_str(&mut rt, "/");
    assert_eq!(rt.state.knobs.query, "gap/", "a / is text while editing");
    assert!(rt.state.knobs.filtering);
}

#[test]
fn down_while_typing_moves_the_row() {
    let mut rt = editing();
    type_str(&mut rt, "right");
    assert_eq!(rt.state.knobs.at(), Some(Node::Knob(1, 0)));
    tap(&mut rt, Key::Down);
    assert_eq!(rt.state.knobs.at(), Some(Node::Knob(1, 1)));
    assert!(rt.state.knobs.filtering && rt.state.knobs.edit().focused, "the field keeps focus");
    tap(&mut rt, Key::Up);
    assert_eq!(rt.state.knobs.at(), Some(Node::Knob(1, 0)));
    assert_eq!(rt.state.knobs.query, "right");
}

#[test]
fn escape_and_return_stop_filtering_then_clear_then_close() {
    let mut rt = editing();
    type_str(&mut rt, "right");
    tap(&mut rt, Key::Enter);
    assert!(!rt.state.knobs.filtering && rt.state.knobs.query == "right", "Return stops and keeps the matches");
    assert!(rt.find("knobs-filter-input").is_none());
    tap(&mut rt, Key::Text("/".into()));
    assert!(rt.state.knobs.filtering, "/ starts again");
    tap(&mut rt, Key::Escape);
    assert!(!rt.state.knobs.filtering && rt.state.knobs.query == "right");
    tap(&mut rt, Key::Escape);
    assert!(rt.state.knobs.query.is_empty() && rt.state.knobs.open, "a second Esc clears");
    tap(&mut rt, Key::Escape);
    assert!(!rt.state.knobs.open, "a third closes");
}

#[test]
fn with_the_field_idle_the_arrows_step_and_fold_again() {
    let mut rt = idle();
    assert_eq!(rt.state.knobs.at(), Some(Node::Knob(1, 0)));
    tap(&mut rt, Key::Right);
    assert_eq!(rt.state.knobs.get(&R), 21.0, "→ steps the knob: focus went back to the panel");
    tap(&mut rt, Key::Left);
    assert_eq!(rt.state.knobs.get(&R), 20.0);
    rt.state.knobs.set_query("");
    rt.invalidate();
    settle(&mut rt);
    rt.state.knobs.set_at(Some(Node::Group(1)), GROUPS);
    tap(&mut rt, Key::Left);
    assert!(rt.state.knobs.folded.contains("Right"), "← folds a header");
    tap(&mut rt, Key::Text("/".into()));
    assert!(rt.state.knobs.filtering, "/ starts when the field is idle");
}

#[test]
fn clicking_away_ends_editing() {
    let mut rt = editing();
    type_str(&mut rt, "gap");
    click_panel(&mut rt);
    tap(&mut rt, Key::Right);
    assert!(!rt.state.knobs.filtering, "the arrows are the panel's again");
}

fn click_panel(rt: &mut Runtime<T>) {
    let (x, y) = rt.find("knobs-about").unwrap();
    rt.pointer_move(x, y);
    settle(rt);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    settle(rt);
}

#[test]
fn query_set_by_the_app_shows_in_the_field() {
    let mut rt = editing();
    rt.state.knobs.set_query("pad");
    rt.invalidate();
    settle(&mut rt);
    type_str(&mut rt, "s");
    assert_eq!(rt.state.knobs.query, "pads", "typing continues from the set text");
}
