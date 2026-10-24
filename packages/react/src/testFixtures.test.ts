import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GameMenu } from "./gameMenu";
import { MENU_THEME_STYLE } from "./testFixtures";

/**
 * `MENU_THEME_STYLE` is type-checked against the menu's `style` prop and kept out of the build; this
 * renders it so the tokens are also proven to reach the surface, not only the compiler.
 */
describe("GameMenu style prop", () => {
  const html = renderToStaticMarkup(
    createElement(GameMenu, {
      items: [{ id: "start", label: "Start" }],
      onSelect: () => {},
      style: MENU_THEME_STYLE,
      sound: false,
    }),
  );

  test("theme tokens reach the menu surface", () => {
    expect(html).toContain("--jg-menu-surface-radius:12px");
    expect(html).toContain("--jg-menu-logo-size:clamp(30px, 5vw, 72px)");
  });

  test("the menu takes its own pointer input and its backdrop never does", () => {
    expect(html).toContain("pointer-events:auto");
    expect(html).toContain("pointer-events:none");
  });
});
