import { useEffect, useState } from "react";

import type { EditorDocument } from "@jgengine/core/editor/index";
import { useGameContext } from "@jgengine/react/provider";
import { AuthoredScene } from "@jgengine/shell/scene";
import { getEditorHost } from "@jgengine/editor";

import { registerExampleStudios } from "@jgengine-examples/studios";

import { editorLayers } from "../../editorLayers";

// Register the example studio adopters (pole_line + bookcase) from the dev runner / game only — they
// live in examples/studios and touch no engine package. The engine environment kinds (water,
// grass_field) register themselves inside AuthoredScene. This one call lights up the whole seam.
registerExampleStudios();

/**
 * Renders the showcase's authored studios — poles + cables, the bookcase generator, the water pond,
 * the grass meadow, and the cracked/mossy soil patch — all from one document, grounded on the live
 * terrain. When the editor is mounted it renders the *live* session document, so headless `set_meta`
 * slider edits update the geometry in real time; otherwise it renders the saved `editorLayers`.
 */
export function StudioShowcaseOverlay() {
  const ctx = useGameContext();
  const [document, setDocument] = useState<EditorDocument>(editorLayers);
  useEffect(() => {
    const host = getEditorHost();
    if (host === null) return;
    const session = host.getSession();
    setDocument(session.getState().document);
    return session.subscribe((state) => setDocument(state.document));
  }, []);
  return <AuthoredScene document={document} field={ctx.world.ground} />;
}
