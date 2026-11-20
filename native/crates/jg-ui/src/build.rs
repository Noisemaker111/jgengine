//! Builds the Rune element tree from all mounted z-ordered layers when specs or shared values change.

use rune::{El, el};

use crate::spec::Node;
use crate::widgets;
use crate::Ui;

/// The root element: a full-viewport box compositing each z-ordered layer in ascending `(z, order)`.
pub fn view(s: &Ui, _cx: &mut rune::Cx<Ui>) -> El {
    let structure_changed = s.rendered_revision.replace(s.revision) != s.revision || !s.built.replace(true);
    if structure_changed { widgets::begin_images(); }
    let mut e = el().w_full().h_full().key("root");
    for layer in &s.layers {
        layer.rendered_page_revision.set(layer.page_revision);
        if layer.root.is_empty() { continue; }
        let mut container = el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0)).key(format!("__layer_{}", layer.id));
        for n in &layer.root {
            container = container.child(build(n, s));
        }
        e = e.child(container);
    }
    if structure_changed { widgets::finish_images(); }
    e
}

pub(crate) fn build(n: &Node, s: &Ui) -> El {
    match n {
        Node::Native(element) => crate::native::build(element, s),
    }
}
