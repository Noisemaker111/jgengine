import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneLayer, runeUiEnabled } from "@jgengine/core/ui/rune/runeLayer.view";

/**
 * Where a screen outside the game shell draws its UI: through Rune when the page asks for it
 * (`?ui=rune`), the page's own elements otherwise. The shell does the same for the in-world HUD.
 */
export function UiLayer({ children }: { children: ReactNode }): ReactNode {
  return runeUiEnabled() ? <RuneLayer>{children}</RuneLayer> : children;
}
