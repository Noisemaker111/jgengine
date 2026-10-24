import type { GameMenuStyle } from "./gameMenu";

/**
 * Menu theme tokens passed through the `style` prop with no cast. This file is type-checked and kept
 * out of the build, so the compiler proves the prop accepts `--jg-*` custom properties on every
 * typecheck while nothing ships from here.
 */
export const MENU_THEME_STYLE: GameMenuStyle = {
  "--jg-menu-surface-radius": "12px",
  "--jg-menu-logo-size": "clamp(30px, 5vw, 72px)",
};
