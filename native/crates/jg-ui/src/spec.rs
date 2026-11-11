//! The tree TypeScript sends as JSON (`set_spec`): native Rune nodes from the engine's JSX
//! host (`{ k: "native", ... }`, see `native.rs`). Per-frame numbers never travel in the spec:
//! a node names a slot in the shared value buffer and the view reads it while building.

use serde::Deserialize;

#[derive(Deserialize)]
#[serde(tag = "k", rename_all = "lowercase")]
pub enum Node {
    Native(crate::native::Element),
}

/// The parsed top-level spec.
pub struct Spec {
    pub children: Vec<Node>,
    /// While true the bridge treats the UI as modal: it hides game input and
    /// shows the cursor.
    pub modal: bool,
}

pub fn parse_spec(json: &str) -> Result<Spec, String> {
    #[derive(Deserialize)]
    struct Raw {
        #[serde(default)]
        children: Vec<Node>,
        #[serde(default)]
        modal: bool,
    }
    let raw: Raw = serde_json::from_str(json).map_err(|e| e.to_string())?;
    Ok(Spec {
        children: raw.children,
        modal: raw.modal,
    })
}

/// Every native field id in the tree.
pub fn field_ids(nodes: &[Node]) -> std::collections::HashSet<String> {
    let mut natives = Vec::new();
    crate::native::fields(nodes, &mut natives);
    natives.into_iter().map(|(id, _)| id.to_owned()).collect()
}
