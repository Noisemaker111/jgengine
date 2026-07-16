import { useGameContext } from "@jgengine/react/provider";
import { AuthoredScene } from "@jgengine/shell/scene";

import { registerExampleStudios } from "@jgengine-examples/studios";

import { editorLayers } from "../../editorLayers";

// Register the example studio adopters (pole_line + bookcase) from the dev runner / game only — they
// live in examples/studios and touch no engine package. The engine environment kinds (water,
// grass_field) register themselves inside AuthoredScene. This one call lights up the whole seam.
registerExampleStudios();

/**
 * Renders the showcase's authored studios — poles + cables, the bookcase generator, the water pond,
 * the grass meadow, and the cracked/mossy soil patch — all from one document, grounded on the live
 * terrain. `<AuthoredScene live>` subscribes to the editor host's document live-sync bus, so
 * headless `set_meta` / `push_document_patch` edits hot-apply without a reload.
 */
export function StudioShowcaseOverlay() {
  const ctx = useGameContext();
  return <AuthoredScene document={editorLayers} field={ctx.world.ground} />;
}
