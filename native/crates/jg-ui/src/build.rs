//! Builds the Rune element tree from the native spec when it or the shared values change.

use rune::{El, el};

use crate::spec::Node;
use crate::widgets;
use crate::Ui;

/// The root element: a full-viewport box the spec's top-level nodes position inside.
pub fn view(s: &Ui, _cx: &mut rune::Cx<Ui>) -> El {
    let structure_changed = s.rendered_revision.replace(s.revision) != s.revision || !s.built.replace(true);
    s.rendered_page_revision.set(s.page_revision);
    if structure_changed { widgets::begin_images(); }
    let mut e = el().w_full().h_full().key("root");
    for n in &s.root {
        e = e.child(build(n, s));
    }
    if structure_changed { widgets::finish_images(); }
    e
}

pub(crate) fn build(n: &Node, s: &Ui) -> El {
    match n {
        Node::Native(element) => crate::native::build(element, s),
    }
}
