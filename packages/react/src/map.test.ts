import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MinimapChrome, type MinimapChromeMarker } from "./map";
import type { MinimapView } from "@jgengine/core/world/minimap";

function renderSvg(props: Parameters<typeof MinimapChrome>[0]): string {
  return renderToStaticMarkup(createElement("svg", null, createElement(MinimapChrome, props)));
}

const view: MinimapView = { center: [0, 0], worldRadius: 100, size: 200 };

describe("MinimapChrome", () => {
  test("renders no frame by default", () => {
    const html = renderSvg({ view });
    expect(html).toContain("data-minimap-chrome");
    expect(html).not.toContain("<circle");
    expect(html).not.toContain(">N<");
  });

  test("frame draws a ring and the default cardinal label", () => {
    const html = renderSvg({ view, frame: true });
    expect(html).toContain("<circle");
    expect(html).toContain(">N<");
  });

  test("cardinalLabel=false omits the label but keeps the ring", () => {
    const html = renderSvg({ view, frame: true, cardinalLabel: false });
    expect(html).toContain("<circle");
    expect(html).not.toContain(">N<");
  });

  test("a marker without heading draws a dot, clamped to the glyph's fill and text", () => {
    const markers: MinimapChromeMarker[] = [{ id: "gate", position: [0, 0], glyph: "G", color: "#fff" }];
    const html = renderSvg({ view, markers });
    expect(html).toContain('data-minimap-marker="gate"');
    expect(html).toContain(">G<");
  });

  test("a marker with heading draws a rotated arrow, not a dot", () => {
    const markers: MinimapChromeMarker[] = [{ id: "player", position: [0, 0], heading: Math.PI / 2 }];
    const html = renderSvg({ view, markers });
    expect(html).toContain('data-minimap-marker="player"');
    expect(html).toContain("<path");
    expect(html).toContain("rotate(90)");
  });

  test("heading rotation is relative to a rotating view", () => {
    const markers: MinimapChromeMarker[] = [{ id: "player", position: [0, 0], heading: Math.PI / 2 }];
    const html = renderSvg({ view: { ...view, rotate: Math.PI / 2 }, markers });
    expect(html).toContain("rotate(0)");
  });

  test("out-of-range markers clamp to the edge by default", () => {
    const markers: MinimapChromeMarker[] = [{ id: "far", position: [500, 0] }];
    const html = renderSvg({ view, markers });
    const match = /cx="([\d.]+)"/.exec(html);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(200);
  });

  test("clampToEdge=false hides out-of-range markers instead of clamping", () => {
    const markers: MinimapChromeMarker[] = [{ id: "far", position: [500, 0], clampToEdge: false }];
    const html = renderSvg({ view, markers });
    expect(html).not.toContain('data-minimap-marker="far"');
  });
});
