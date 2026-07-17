import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HudFrame, hudFrameStyle } from "./hudFrame";

describe("hudFrameStyle", () => {
  test("glass matches the shared dark-glass panel", () => {
    expect(hudFrameStyle("glass").background).toBe("rgba(10,12,16,0.62)");
  });

  test("retro uses a hard black outline", () => {
    expect(hudFrameStyle("retro").border).toBe("2px solid #000");
  });

  test("circle shape yields a 9999px radius", () => {
    expect(hudFrameStyle("glass", "circle").borderRadius).toBe(9999);
  });
});

describe("HudFrame", () => {
  test("renders a data-hud-frame element for every variation", () => {
    for (const variation of ["glass", "plate", "retro"] as const) {
      const html = renderToStaticMarkup(createElement(HudFrame, { variation }));
      expect(html).toContain("data-hud-frame");
    }
  });

  test("glass frame carries the dark-glass background", () => {
    const html = renderToStaticMarkup(createElement(HudFrame, { variation: "glass" }));
    expect(html).toContain("rgba(10,12,16,0.62)");
  });

  test("retro frame carries the hard black outline", () => {
    const html = renderToStaticMarkup(createElement(HudFrame, { variation: "retro" }));
    expect(html).toContain("#000");
  });

  test("circle shape yields a 9999px radius", () => {
    const html = renderToStaticMarkup(createElement(HudFrame, { shape: "circle" }));
    expect(html).toContain("9999px");
  });

  test("renders the title and aside header slots plus children", () => {
    const html = renderToStaticMarkup(
      createElement(HudFrame, { title: "ESCAPE ROUTE", aside: "N" }, "body-content"),
    );
    expect(html).toContain("ESCAPE ROUTE");
    expect(html).toContain(">N<");
    expect(html).toContain("body-content");
  });
});
