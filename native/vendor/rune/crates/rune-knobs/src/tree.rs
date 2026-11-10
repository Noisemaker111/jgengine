//! What the side panel lists, in what order and what's folded, and its keys. Groups filed
//! under a page fold with it. The Tree layout starts with everything folded, a list of all the
//! parts with a dot on what's on screen, until one is opened; the others open what's on screen. [`LAYOUT`] picks how they're laid out
//! while comparing. ↑/↓ move a row, ← → fold and open a header or step a knob, `/` starts the
//! filter (a real text field: see [`Knobs::filter_key`] for the few keys the panel keeps while
//! it edits), Esc stops filtering, then clears the filter, then closes.
#![cfg_attr(not(feature = "panel"), allow(dead_code))]

use std::collections::BTreeSet;

use rune::{Key, KeyEvent};

use crate::{Group, Knobs, LAYOUT};

/// The On screen layout's second caption.
pub(crate) const REST: &str = "Not on screen";
pub(crate) const SEEN: &str = "On screen";

/// A row the keyboard can stand on: a page's header, a group's header (by index), or one of a
/// group's knobs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Node {
    Page(&'static str),
    Group(usize),
    Knob(usize, usize),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Layout {
    Tree,
    OnScreen,
    Tabs,
}

pub(crate) fn layout(k: &Knobs) -> Layout {
    match k.get(&LAYOUT).round() as usize {
        1 => Layout::OnScreen,
        2 => Layout::Tabs,
        _ => Layout::Tree,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Head {
    /// A page's header, which folds the page.
    Page(&'static str),
    /// A caption over the groups, which doesn't fold.
    Caption(&'static str),
    /// The groups alone.
    Bare,
}

/// A group as listed: open or folded, its part on screen or not, the knobs it shows (all of
/// them unless filtered), and whether it's listed apart from its page, so its title names the
/// page ("Item page · Header") and needs no on-screen mark.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Sub {
    pub g: usize,
    pub open: bool,
    pub seen: bool,
    pub knobs: Vec<usize>,
    pub full: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Section {
    pub head: Head,
    pub open: bool,
    pub seen: bool,
    pub subs: Vec<Sub>,
}

/// The whole list, and in the Tabs layout the tabs (page, on screen) and the one showing.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Plan {
    pub sections: Vec<Section>,
    pub tabs: Vec<(&'static str, bool)>,
    pub tab: Option<&'static str>,
    pub seen: BTreeSet<usize>,
}

/// Pages in the order their first group is declared.
fn pages(groups: &[Group]) -> Vec<&'static str> {
    let mut out: Vec<&'static str> = Vec::new();
    for g in groups {
        if !out.contains(&g.page()) {
            out.push(g.page());
        }
    }
    out
}

/// Knob `i` of `g` matches every word of `q` across its page, group, title and description.
fn matches(g: &Group, i: usize, words: &[String]) -> bool {
    let d = &g.knobs[i];
    let hay = format!("{} {} {} {} {}", g.under, g.name, d.title(), d.name, d.describe()).to_lowercase();
    words.iter().all(|w| hay.contains(w.as_str()))
}

/// What the panel lists for `seen` (the groups whose part of the window is on screen).
pub(crate) fn plan(k: &Knobs, groups: &[Group], seen: BTreeSet<usize>) -> Plan {
    let words: Vec<String> = k.query.split_whitespace().map(str::to_lowercase).collect();
    // `lead`: open by default while on screen; otherwise folded until it's opened.
    let sub = |g: usize, full: bool, lead: bool| {
        let s = seen.contains(&g);
        Sub { g, open: !k.is_folded(groups[g].name, !(s && lead)), seen: s, knobs: (0..groups[g].knobs.len()).collect(), full }
    };
    let mut plan = Plan::default();
    if !words.is_empty() {
        let subs = (0..groups.len())
            .filter_map(|g| {
                let knobs: Vec<usize> = (0..groups[g].knobs.len()).filter(|&i| matches(&groups[g], i, &words)).collect();
                (!knobs.is_empty()).then(|| Sub { open: true, knobs, ..sub(g, true, true) })
            })
            .collect();
        plan.sections.push(Section { head: Head::Bare, open: true, seen: false, subs });
        plan.seen = seen;
        return plan;
    }
    let of = |page: &str| (0..groups.len()).filter(|&g| groups[g].page() == page).collect::<Vec<_>>();
    match layout(k) {
        Layout::Tree => {
            for p in pages(groups) {
                let gs = of(p);
                let lit = gs.iter().any(|g| seen.contains(g));
                if gs.len() == 1 && groups[gs[0]].under.is_empty() {
                    plan.sections.push(Section { head: Head::Bare, open: true, seen: lit, subs: vec![sub(gs[0], false, false)] });
                } else {
                    // A page opens with the group left open in it.
                    let holds = gs.iter().any(|&g| k.group.as_deref() == Some(groups[g].name) && k.unfolded.contains(groups[g].name));
                    plan.sections.push(Section { head: Head::Page(p), open: !k.is_folded(p, !holds), seen: lit, subs: gs.iter().map(|&g| sub(g, false, false)).collect() });
                }
            }
        }
        Layout::OnScreen => {
            let (on, off): (Vec<usize>, Vec<usize>) = (0..groups.len()).partition(|g| seen.contains(g));
            if !on.is_empty() {
                plan.sections.push(Section { head: Head::Caption(SEEN), open: true, seen: true, subs: on.into_iter().map(|g| sub(g, true, true)).collect() });
            }
            if !off.is_empty() {
                plan.sections.push(Section { head: Head::Caption(REST), open: true, seen: false, subs: off.into_iter().map(|g| sub(g, true, true)).collect() });
            }
        }
        Layout::Tabs => {
            plan.tabs = pages(groups).into_iter().map(|p| (p, of(p).iter().any(|g| seen.contains(g)))).collect();
            let picked = k.tab.as_deref().and_then(|t| plan.tabs.iter().find(|(p, _)| *p == t));
            let tab = picked.or(plan.tabs.iter().find(|(_, on)| *on)).or(plan.tabs.first()).map(|(p, _)| *p);
            plan.tab = tab;
            if let Some(t) = tab {
                plan.sections.push(Section { head: Head::Bare, open: true, seen: true, subs: of(t).into_iter().map(|g| sub(g, false, true)).collect() });
            }
        }
    }
    plan.seen = seen;
    plan
}

/// The rows the keyboard walks, top to bottom.
pub(crate) fn rows(plan: &Plan) -> Vec<Node> {
    let mut out = Vec::new();
    for s in &plan.sections {
        if let Head::Page(p) = s.head {
            out.push(Node::Page(p));
        }
        if !s.open {
            continue;
        }
        for sub in &s.subs {
            out.push(Node::Group(sub.g));
            if sub.open {
                out.extend(sub.knobs.iter().map(|&i| Node::Knob(sub.g, i)));
            }
        }
    }
    out
}

/// What a key did: nothing, a change to show at once, or a fold to animate.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Did {
    Not,
    Now,
    Fold,
}

impl Knobs {
    pub(crate) fn at(&self) -> Option<Node> {
        self.at
    }
    /// Puts the keyboard on `n`; a group's row makes it the panel's group.
    pub(crate) fn set_at(&mut self, n: Option<Node>, groups: &[Group]) {
        self.at = n;
        let (g, i) = match n {
            Some(Node::Knob(g, i)) => (g, i),
            Some(Node::Group(g)) => (g, 0),
            _ => return,
        };
        if let Some(grp) = groups.get(g) {
            self.group = Some(grp.name.to_owned());
            self.cursor = i;
        }
    }

    /// The side panel's keys, against what it lists now.
    pub(crate) fn tree_key(&mut self, groups: &[Group], plan: &Plan, ev: &KeyEvent) -> Did {
        if ev.mods.cmd || ev.mods.alt || ev.mods.ctrl {
            return Did::Not;
        }
        // Focus left the field without the panel hearing of it (a click elsewhere).
        if self.filtering && !self.edit.focused {
            self.filtering = false;
        }
        if self.filtering {
            return self.filter_key(groups, plan, ev);
        }
        let rows = rows(plan);
        let here = self.at.and_then(|n| rows.iter().position(|r| *r == n));
        let did = match &ev.key {
            Key::Escape if !self.query.is_empty() => {
                self.set_query("");
                Did::Now
            }
            Key::Escape => {
                self.close();
                return Did::Now;
            }
            Key::Up | Key::Down | Key::Tab => self.move_row(groups, plan, ev),
            Key::Left | Key::Right => {
                let right = ev.key == Key::Right;
                match self.at.filter(|_| here.is_some()) {
                    Some(Node::Knob(g, i)) => {
                        self.step(&groups[g].knobs[i], right, ev.mods.shift);
                        Did::Now
                    }
                    Some(n @ (Node::Group(_) | Node::Page(_))) => {
                        let (name, open) = match n {
                            Node::Group(g) => (groups[g].name, plan.sections.iter().flat_map(|s| &s.subs).any(|s| s.g == g && s.open)),
                            Node::Page(p) => (p, plan.sections.iter().any(|s| s.head == Head::Page(p) && s.open)),
                            Node::Knob(..) => unreachable!(),
                        };
                        match (right, open) {
                            (true, false) | (false, true) => {
                                self.set_folded(name, !right);
                                Did::Fold
                            }
                            (true, true) => {
                                if let Some(next) = here.and_then(|i| rows.get(i + 1)) {
                                    self.set_at(Some(*next), groups);
                                }
                                Did::Now
                            }
                            (false, false) => {
                                // A folded group's ← goes up to its page.
                                if let Node::Group(g) = n
                                    && !groups[g].under.is_empty()
                                    && rows.contains(&Node::Page(groups[g].under))
                                {
                                    self.set_at(Some(Node::Page(groups[g].under)), groups);
                                }
                                Did::Now
                            }
                        }
                    }
                    None if !rows.is_empty() => {
                        self.set_at(Some(rows[0]), groups);
                        Did::Now
                    }
                    None => Did::Not,
                }
            }
            Key::Enter => match self.at.filter(|_| here.is_some()) {
                Some(Node::Group(g)) => {
                    let name = groups[g].name;
                    let folded = !plan.sections.iter().flat_map(|s| &s.subs).any(|s| s.g == g && s.open);
                    self.set_folded(name, !folded);
                    Did::Fold
                }
                Some(Node::Page(p)) => {
                    let folded = !plan.sections.iter().any(|s| s.head == Head::Page(p) && s.open);
                    self.set_folded(p, !folded);
                    Did::Fold
                }
                _ => Did::Not,
            },
            Key::Backspace if !self.query.is_empty() => {
                let mut q = self.query.clone();
                q.pop();
                self.set_query(&q);
                self.refilter(groups, plan);
                Did::Now
            }
            Key::Text(t) if t == "/" => {
                self.start_filter();
                Did::Now
            }
            // 1–9 pick the keyboard's choice's option.
            Key::Text(t) if t.len() == 1 && matches!(t.as_bytes()[0], b'1'..=b'9') => {
                let n = (t.as_bytes()[0] - b'1') as usize;
                match self.at.filter(|_| here.is_some()) {
                    Some(Node::Knob(g, i)) if n < groups[g].knobs[i].labels.len() => {
                        let d = groups[g].knobs[i];
                        self.checkpoint();
                        self.set(&d, n as f32);
                        Did::Now
                    }
                    // Taken even so: the page's own number keys (a decision's options) wait for the panel to let go.
                    _ => Did::Now,
                }
            }
            Key::Text(t) if (t == "[" || t == "]") && !plan.tabs.is_empty() => {
                let i = plan.tab.and_then(|c| plan.tabs.iter().position(|(p, _)| *p == c)).unwrap_or(0) as i32;
                let n = plan.tabs.len() as i32;
                self.tab = Some(plan.tabs[(i + if t == "[" { -1 } else { 1 }).rem_euclid(n) as usize].0.to_owned());
                self.at = None;
                Did::Now
            }
            _ => Did::Not,
        };
        if did != Did::Not {
            self.kbd = true;
        }
        did
    }

    /// The keys the panel keeps while the filter field edits (it hears every other key first
    /// and owns ← →, digits, `[` `]`, `/`, Backspace and the ⌘ ⌥ chords): ↑ ↓ move the row so
    /// a result is an arrow away, Tab moves between headers, Return stops filtering, and Esc
    /// stops it too (the matches stay; Esc again clears them, and again closes).
    pub(crate) fn filter_key(&mut self, groups: &[Group], plan: &Plan, ev: &KeyEvent) -> Did {
        if ev.mods.cmd || ev.mods.alt || ev.mods.ctrl {
            return Did::Not;
        }
        let did = match &ev.key {
            Key::Escape => {
                self.stop_filter();
                if rows(plan).is_empty() {
                    self.set_query("");
                }
                Did::Now
            }
            Key::Enter => {
                self.stop_filter();
                Did::Now
            }
            Key::Up | Key::Down | Key::Tab => self.move_row(groups, plan, ev),
            _ => Did::Not,
        };
        if did != Did::Not {
            self.kbd = true;
        }
        did
    }

    /// ↑ ↓ walk the rows; Tab jumps between headers.
    fn move_row(&mut self, groups: &[Group], plan: &Plan, ev: &KeyEvent) -> Did {
        let rows = rows(plan);
        let here = self.at.and_then(|n| rows.iter().position(|r| *r == n));
        match &ev.key {
            Key::Up | Key::Down if !rows.is_empty() => {
                let down = ev.key == Key::Down;
                let i = match here {
                    Some(i) if down => (i + 1).min(rows.len() - 1),
                    Some(i) => i.saturating_sub(1),
                    None if down => 0,
                    None => rows.len() - 1,
                };
                self.set_at(Some(rows[i]), groups);
                Did::Now
            }
            Key::Tab => {
                let heads: Vec<usize> = (0..rows.len()).filter(|&i| !matches!(rows[i], Node::Knob(..))).collect();
                let at = here.unwrap_or(0);
                let next = if ev.mods.shift { heads.iter().rev().find(|&&i| i < at).or(heads.last()) } else { heads.iter().find(|&&i| i > at).or(heads.first()) };
                if let Some(&i) = next {
                    self.set_at(Some(rows[i]), groups);
                }
                Did::Now
            }
            _ => Did::Not,
        }
    }

    /// After the filter changes, the keyboard stands on the first knob it shows.
    pub(crate) fn refilter(&mut self, groups: &[Group], before: &Plan) {
        let now = plan(self, groups, before.seen.clone());
        let first = rows(&now).into_iter().find(|n| matches!(n, Node::Knob(..)));
        self.set_at(first, groups);
    }
}

#[cfg(test)]
#[path = "tree_tests.rs"]
mod tests;
