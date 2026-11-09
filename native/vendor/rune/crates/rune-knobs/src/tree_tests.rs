use super::*;
use crate::Knob;

const A: Knob = Knob::new("Header fade", 0.0, 10.0, 5.0).about("How tall the fade under the header is");
const B: Knob = Knob::choice("Table look", &["Lines", "Zebra"], 0);
const C: Knob = Knob::new("Row gap", 0.0, 8.0, 2.0);
const D: Knob = Knob::new("Dock radius", 0.0, 24.0, 14.0);
const GROUPS: &[Group] = &[
    Group::new("Header", "hdr", &[A]).under("Item page"),
    Group::new("Tables", "table", &[B]).under("Item page"),
    Group::new("Rows", "list", &[C]).under("Sidebar"),
    Group::new("Dock", "dock", &[D]),
];

fn seen(gs: &[usize]) -> BTreeSet<usize> {
    gs.iter().copied().collect()
}

fn key(k: &mut Knobs, ev: Key) -> Did {
    let p = plan(k, GROUPS, seen(&[0, 3]));
    k.tree_key(GROUPS, &p, &KeyEvent { key: ev, mods: Default::default() })
}

#[test]
fn everything_starts_folded_with_a_dot_on_whats_on_screen() {
    let k = Knobs::default();
    let p = plan(&k, GROUPS, seen(&[0, 3]));
    assert_eq!(p.sections.len(), 3, "Item page, Sidebar, Dock");
    assert_eq!(p.sections[0].head, Head::Page("Item page"));
    assert!(p.sections.iter().all(|s| s.head == Head::Bare || !s.open), "every page folded");
    assert!(p.sections.iter().flat_map(|s| &s.subs).all(|s| !s.open), "every group folded");
    assert!(p.sections[0].seen && !p.sections[1].seen);
    assert!(p.sections[0].subs[0].seen && !p.sections[0].subs[1].seen);
    assert_eq!(p.sections[2].head, Head::Bare, "a group on its own needs no page");
    assert_eq!(rows(&p), vec![Node::Page("Item page"), Node::Page("Sidebar"), Node::Group(3)]);
}

#[test]
fn explicit_folds_win() {
    let mut k = Knobs::default();
    k.set_folded("Header", false);
    k.set_folded("Item page", true);
    k.set_folded("Sidebar", false);
    let p = plan(&k, GROUPS, seen(&[0, 3]));
    assert!(p.sections[0].subs[0].open && !p.sections[0].open);
    assert!(p.sections[1].open);
}

#[test]
fn reopening_folds_all_but_the_group_last_left_open() {
    let mut k = Knobs::default();
    k.show();
    k.set_folded("Sidebar", false);
    k.set_folded("Rows", false);
    k.set_folded("Item page", false);
    k.set_folded("Tables", false);
    k.group = Some("Tables".into());
    k.close();
    k.show();
    let p = plan(&k, GROUPS, seen(&[]));
    assert!(p.sections[0].open && p.sections[0].subs[1].open, "Tables and its page open");
    assert!(!p.sections[0].subs[0].open && !p.sections[1].open, "the rest folded");
    k.set_folded("Tables", true);
    k.close();
    k.show();
    let p = plan(&k, GROUPS, seen(&[]));
    assert!(!p.sections[0].open, "folded last, so nothing stays open");
}

#[test]
fn on_screen_layout_lists_whats_showing_first() {
    let mut k = Knobs::default();
    k.set(&LAYOUT, 1.0);
    let p = plan(&k, GROUPS, seen(&[1, 3]));
    assert_eq!(p.sections[0].head, Head::Caption(SEEN));
    assert_eq!(p.sections[0].subs.iter().map(|s| s.g).collect::<Vec<_>>(), vec![1, 3]);
    assert!(p.sections[0].subs[0].full, "it names its page");
    assert_eq!(p.sections[1].head, Head::Caption(REST));
    assert!(p.sections[1].subs.iter().all(|s| !s.open));
}

#[test]
fn tabs_layout_opens_on_the_page_thats_showing() {
    let mut k = Knobs::default();
    k.set(&LAYOUT, 2.0);
    let p = plan(&k, GROUPS, seen(&[2]));
    assert_eq!(p.tab, Some("Sidebar"));
    assert_eq!(p.tabs.len(), 3);
    assert_eq!(p.sections[0].subs.iter().map(|s| s.g).collect::<Vec<_>>(), vec![2]);
    k.tree_key(GROUPS, &p, &KeyEvent { key: Key::Text("]".into()), mods: Default::default() });
    assert_eq!(plan(&k, GROUPS, seen(&[2])).tab, Some("Dock"));
}

#[test]
fn slash_then_a_query_filters_by_name_and_description() {
    let mut k = Knobs::default();
    assert_eq!(key(&mut k, Key::Text("t".into())), Did::Not, "a letter alone doesn't filter");
    assert!(k.query.is_empty());
    key(&mut k, Key::Text("/".into()));
    assert!(k.filtering);
    assert_eq!(key(&mut k, Key::Text("t".into())), Did::Not, "the field takes typing, not the tree");
    assert_eq!(key(&mut k, Key::Right), Did::Not, "and ← →");
    k.set_query("tall");
    k.refilter(GROUPS, &plan(&k, GROUPS, seen(&[])));
    let p = plan(&k, GROUPS, seen(&[]));
    assert_eq!(rows(&p), vec![Node::Group(0), Node::Knob(0, 0)], "matches A's description");
    assert_eq!(k.at(), Some(Node::Knob(0, 0)), "the keyboard lands on the first match");
    key(&mut k, Key::Escape);
    assert!(!k.filtering && k.query == "tall", "Esc stops typing and keeps the matches");
    key(&mut k, Key::Escape);
    assert!(k.query.is_empty(), "a second Esc clears the filter");
}

#[test]
fn number_keys_pick_the_keyboard_choices_option() {
    let mut k = Knobs::default();
    k.open = true;
    k.set_folded("Item page", false);
    k.set_folded("Tables", false);
    let p = plan(&k, GROUPS, seen(&[0, 3]));
    k.set_at(Some(Node::Knob(1, 0)), GROUPS);
    assert!(rows(&p).contains(&Node::Knob(1, 0)));
    assert_eq!(key(&mut k, Key::Text("2".into())), Did::Now);
    assert_eq!(k.get(&B), 1.0, "2 picks Zebra");
    key(&mut k, Key::Text("3".into()));
    assert_eq!(k.get(&B), 1.0, "past the last option does nothing");
    k.undo();
    assert_eq!(k.get(&B), 0.0, "undoable");
}

#[test]
fn arrows_walk_rows_and_fold_headers() {
    let mut k = Knobs::default();
    k.open = true;
    assert_eq!(key(&mut k, Key::Down), Did::Now);
    assert_eq!(k.at(), Some(Node::Page("Item page")));
    assert_eq!(key(&mut k, Key::Right), Did::Fold);
    assert!(k.unfolded.contains("Item page"));
    assert_eq!(key(&mut k, Key::Left), Did::Fold);
    assert!(k.folded.contains("Item page"));
    assert_eq!(key(&mut k, Key::Down), Did::Now);
    assert_eq!(k.at(), Some(Node::Page("Sidebar")), "the folded page's rows are skipped");
    assert_eq!(key(&mut k, Key::Right), Did::Fold);
    assert!(k.unfolded.contains("Sidebar"));
    key(&mut k, Key::Right);
    assert_eq!(k.at(), Some(Node::Group(2)), "→ on an open header goes in");
    key(&mut k, Key::Right);
    key(&mut k, Key::Right);
    assert_eq!(k.at(), Some(Node::Knob(2, 0)));
    key(&mut k, Key::Right);
    assert!((k.get(&C) - 2.08).abs() < 1e-4, "→ on a knob steps it");
    assert_eq!(k.group.as_deref(), Some("Rows"));
}
