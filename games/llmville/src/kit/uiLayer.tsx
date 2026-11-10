/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneLayer, runeUiEnabled } from "@jgengine/core/ui/rune/runeLayer.view";

/** Read once as the page loads: moving between screens rewrites the address, and the page keeps the mode it opened in. */
const DRAW_THROUGH_RUNE = runeUiEnabled();

/**
 * Where a screen outside the game shell draws its UI: through Rune when the page asks for it
 * (`?ui=rune`), the page's own elements otherwise. The shell does the same for the in-world HUD.
 */
export function UiLayer({ children }: { children: ReactNode }): ReactNode {
  return DRAW_THROUGH_RUNE ? <RuneLayer>{children}</RuneLayer> : children;
}
