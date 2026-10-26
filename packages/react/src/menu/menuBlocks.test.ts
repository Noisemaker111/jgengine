import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MenuScreen } from "./menuScreen";

describe("MenuScreen", () => {
  test("renders its content, scrim and backdrop while open", () => {
    const html = renderToStaticMarkup(
      createElement(MenuScreen, { open: true, label: "Paused", backdrop: createElement("canvas") }, createElement("p", null, "Paused")),
    );
    expect(html).toContain("data-jg-menu-screen");
    expect(html).toContain('data-phase="enter"');
    expect(html).toContain("data-jg-menu-scrim");
    expect(html).toContain("data-jg-menu-backdrop");
    expect(html).toContain("<canvas");
    expect(html).toContain("Paused");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Paused"');
  });

  test("renders nothing while closed", () => {
    const html = renderToStaticMarkup(createElement(MenuScreen, { open: false }, createElement("p", null, "hidden")));
    expect(html).toBe("");
  });

  test("reduced motion skips straight to the open phase", () => {
    const html = renderToStaticMarkup(
      createElement(MenuScreen, { open: true, reducedMotion: true }, createElement("p", null, "Ready")),
    );
    expect(html).toContain('data-phase="open"');
    expect(html).not.toContain("jg-fade-in");
  });

  test("the scrim stays translucent so a live scene shows through", () => {
    const html = renderToStaticMarkup(createElement(MenuScreen, { open: true }, createElement("p", null, "x")));
    expect(html).toContain("rgba(0,0,0,0.34)");
    expect(html).toContain("rgba(0,0,0,0.78)");
    expect(html).not.toContain("background:#000");
  });
});
