import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";

import { ControlsList, StartScreen } from "./startScreen";

const bindings: ActionCodesMap = {
  throttleUp: ["KeyW"],
  throttleDown: ["KeyS"],
  pitchForward: ["ArrowUp"],
  boost: ["Space"],
};

describe("ControlsList", () => {
  test("derives key glyphs from the keybind map", () => {
    const html = renderToStaticMarkup(
      createElement(ControlsList, {
        bindings,
        controls: [
          { action: ["throttleUp", "throttleDown"], label: "Throttle up / down" },
          { action: "pitchForward", label: "Pitch forward" },
          { action: "boost", label: "Boost" },
        ],
      }),
    );
    expect(html).toContain("Throttle up / down");
    expect(html).toContain(">W</kbd>");
    expect(html).toContain(">S</kbd>");
    expect(html).toContain("↑");
    expect(html).toContain("Space");
    expect(html).toContain("data-jg-kbd-hint");
  });

  test("literal keys render for controls outside the map", () => {
    const html = renderToStaticMarkup(
      createElement(ControlsList, { bindings, controls: [{ keys: "Mouse", label: "Look" }] }),
    );
    expect(html).toContain(">Mouse</kbd>");
    expect(html).toContain("Look");
  });

  test("unbound actions are skipped, not rendered as placeholders", () => {
    const html = renderToStaticMarkup(
      createElement(ControlsList, { bindings, controls: [{ action: "missing", label: "Nothing" }] }),
    );
    expect(html).not.toContain("<kbd");
    expect(html).toContain("Nothing");
  });

  test("hideOnCoarsePointer=false drops the hide marker", () => {
    const html = renderToStaticMarkup(
      createElement(ControlsList, {
        bindings,
        hideOnCoarsePointer: false,
        controls: [{ action: "boost", label: "Boost" }],
      }),
    );
    expect(html).not.toContain("data-jg-kbd-hint");
  });
});

describe("StartScreen", () => {
  test("renders a menu overlay with children", () => {
    const html = renderToStaticMarkup(
      createElement(StartScreen, { className: "menu" }, "TITLE"),
    );
    expect(html).toContain("data-jg-menu");
    expect(html).toContain('data-screen="start"');
    expect(html).toContain("TITLE");
  });

  test("open=false renders nothing", () => {
    const html = renderToStaticMarkup(createElement(StartScreen, { open: false }, "TITLE"));
    expect(html).toBe("");
  });

  test("settings placement wraps the trigger in the chosen corner", () => {
    const html = renderToStaticMarkup(
      createElement(StartScreen, { settings: "GEAR", settingsPlacement: "bottom-left" }),
    );
    expect(html).toContain("data-jg-menu-settings");
    expect(html).toContain("GEAR");
  });
});
