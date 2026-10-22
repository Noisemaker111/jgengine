import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MenuScreen } from "./menuScreen";
import { TitleMenu } from "./titleMenu";

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

describe("TitleMenu", () => {
  const items = [
    { id: "continue", label: "Continue", primary: true, hint: "Chapter 3" },
    { id: "new", label: "New Game" },
    { id: "settings", label: "Settings" },
    { id: "credits", label: "Credits", disabled: true },
  ];

  test("renders the wordmark, every verb, the nav container and the footer hint", () => {
    const html = renderToStaticMarkup(
      createElement(TitleMenu, { title: "Beacon Bastion", tagline: "Hold the line", items, onSelect: () => undefined }),
    );
    expect(html).toContain("Beacon Bastion");
    expect(html).toContain("Hold the line");
    expect(html).toContain("data-jg-menu-nav");
    expect(html).toContain("data-title-item");
    expect(html).toContain("Continue");
    expect(html).toContain("Chapter 3");
    expect(html).toContain("Esc back");
    expect(html).toContain("data-jg-kbd-hint");
  });

  test("focuses the first enabled verb with a roving tabindex and marks disabled verbs", () => {
    const html = renderToStaticMarkup(createElement(TitleMenu, { title: "T", items, onSelect: () => undefined }));
    expect(html).toContain('data-jg-menu-item="continue"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('data-title-item="credits"');
    expect(html).toContain('disabled=""');
  });

  test("a backdrop replaces the flat scrim treatment", () => {
    const html = renderToStaticMarkup(
      createElement(TitleMenu, {
        title: "T",
        items,
        onSelect: () => undefined,
        backdrop: createElement("div", { id: "scene" }),
        scrim: "none",
      }),
    );
    expect(html).toContain('id="scene"');
    expect(html).toContain('data-scrim="none"');
  });
});
