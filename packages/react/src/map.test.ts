import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  Compass,
  FullscreenMap,
  MapLegend,
  Minimap,
  MinimapChrome,
  MinimapTrack,
  WaypointArrow,
  WorldMap,
  type MinimapChromeMarker,
} from "./map";
import { createMarkerSet, createMarkerSource } from "@jgengine/core/world/markers";
import type { MinimapView } from "@jgengine/core/world/minimap";

function renderSvg(props: Parameters<typeof MinimapChrome>[0]): string {
  return renderToStaticMarkup(createElement("svg", null, createElement(MinimapChrome, props)));
}

const view: MinimapView = { center: [0, 0], worldRadius: 100, size: 200 };

describe("portable minimap markers", () => {
  test("renders a static display-marker array without lifecycle fields or GameProvider", () => {
    const markers = [
      { id: "ally-1", position: [12, 0, -4] as const, kind: "ally" },
      { id: "plain-1", position: [-8, 0, 6] as const },
    ] as const;

    const html = renderToStaticMarkup(
      createElement(Minimap, { markers, center: [0, 0], worldRadius: 100, size: 180 }),
    );

    expect(html).toContain('data-marker-kind="ally"');
    expect(html).toContain('data-marker-kind="marker"');
  });

  test("keeps existing MarkerSet callers source-compatible", () => {
    const markers = createMarkerSet(() => 100);
    markers.add({ id: "objective-1", kind: "objective", position: [0, 0, 10] });

    const minimap = renderToStaticMarkup(
      createElement(Minimap, { markers, center: [0, 0], worldRadius: 100 }),
    );
    const compass = renderToStaticMarkup(
      createElement(Compass, { markers, center: [0, 0], facingYaw: 0 }),
    );

    expect(minimap).toContain('data-marker-kind="objective"');
    expect(compass).toContain('data-compass-marker="objective"');
  });

  test("renders a mapped external source with hydration-stable SSR output", () => {
    const units = [
      { id: "red-1", x: 16, z: -24, team: "enemy", name: "Scout" },
      { id: "blue-1", x: -12, z: 9, team: "ally", name: "Guard" },
    ];
    const markers = createMarkerSource({
      subscribe: () => () => undefined,
      getSnapshot: () => units,
      project: (unit) => ({
        id: unit.id,
        position: [unit.x, 0, unit.z],
        kind: unit.team,
        label: unit.name,
      }),
    });
    const render = () =>
      renderToStaticMarkup(
        createElement(Minimap, { markers, center: [0, 0], worldRadius: 120, title: "External units" }),
      );

    const first = render();
    expect(render()).toBe(first);
    expect(first).toContain('data-marker-kind="enemy"');
    expect(first).toContain('data-marker-kind="ally"');
  });

  test("shares the portable source with the full WorldMap renderer", () => {
    const markers = createMarkerSource({
      getSnapshot: () => [{ id: "site", x: 3, z: 7, label: "Relay" }],
      project: (entry) => ({ id: entry.id, position: [entry.x, 0, entry.z], label: entry.label }),
    });
    const html = renderToStaticMarkup(
      createElement(WorldMap, {
        markers,
        bounds: { minX: -20, minZ: -20, maxX: 20, maxZ: 20 },
        width: 240,
      }),
    );

    expect(html).toContain('data-world-marker="marker"');
    expect(html).toContain("Relay");
  });
});

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

describe("FullscreenMap", () => {
  const bounds = { minX: -50, minZ: -50, maxX: 50, maxZ: 50 };

  test("renders the world-map surface under a content transform group", () => {
    const markers = [{ id: "wp-1", position: [10, 0, -8] as const, kind: "waypoint", label: "Camp" }] as const;
    const html = renderToStaticMarkup(createElement(FullscreenMap, { markers, bounds, title: "Atlas" }));
    expect(html).toContain("data-fullscreen-map");
    expect(html).toContain("data-world-map-canvas");
    expect(html).toContain("data-world-map-content");
    expect(html).toContain('data-world-marker="waypoint"');
    expect(html).toContain("Camp");
    expect(html).toContain("Atlas");
  });

  test("open=false renders nothing", () => {
    const html = renderToStaticMarkup(createElement(FullscreenMap, { markers: [], bounds, open: false }));
    expect(html).toBe("");
  });

  test("tool='draw' marks the viewport and forwards annotation routes to the surface", () => {
    const routes = [{ id: "note-1", points: [[-10, -10], [10, 10]] as const }];
    const html = renderToStaticMarkup(
      createElement(FullscreenMap, { markers: [], bounds, tool: "draw", routes }),
    );
    expect(html).toContain('data-map-tool="draw"');
    expect(html).toContain('data-map-route="note-1"'); // drawn strokes render through the map's route layer
  });

  test("defaults to the pan tool", () => {
    const html = renderToStaticMarkup(createElement(FullscreenMap, { markers: [], bounds }));
    expect(html).toContain('data-map-tool="pan"');
  });
});

describe("MapLegend", () => {
  test("keys each kind with its glyph and a human label", () => {
    const html = renderToStaticMarkup(
      createElement(MapLegend, { kinds: ["waypoint", "enemy"], labels: { waypoint: "Waypoint" } }),
    );
    expect(html).toContain('data-legend-kind="waypoint"');
    expect(html).toContain('data-legend-kind="enemy"');
    expect(html).toContain("Waypoint");
    expect(html).toContain("⚑"); // the waypoint glyph from DEFAULT_MARKER_KINDS
  });
});

describe("WaypointArrow", () => {
  test("rotates the needle by the facing-relative bearing and shows a distance readout", () => {
    const html = renderToStaticMarkup(
      createElement(WaypointArrow, { relative: Math.PI / 2, distance: 128, label: "Camp" }),
    );
    expect(html).toContain("data-waypoint-arrow");
    expect(html).toContain("rotate(90 22 22)");
    expect(html).toContain("128m");
    expect(html).toContain("Camp");
  });
});

describe("MinimapTrack", () => {
  function renderTrack(props: Parameters<typeof MinimapTrack>[0]): string {
    return renderToStaticMarkup(createElement(MinimapTrack, props));
  }

  test("a span renders at the right left% and width%", () => {
    const html = renderTrack({ spans: [{ id: "zone", start: 0.25, end: 0.5, color: "#b7410e" }] });
    expect(html).toContain('data-track-span="zone"');
    expect(html).toContain("left:25%");
    expect(html).toContain("width:25%");
  });

  test("a pip renders at the right left%", () => {
    const html = renderTrack({ pips: [{ id: "you", at: 0.75, shape: "player" }] });
    expect(html).toContain('data-track-pip="you"');
    expect(html).toContain("left:75%");
  });

  test("player and gate pips render distinct shapes", () => {
    const html = renderTrack({
      pips: [
        { id: "gate", at: 0.1, shape: "gate" },
        { id: "player", at: 0.9, shape: "player" },
      ],
    });
    expect(html).toContain('data-pip-shape="gate"');
    expect(html).toContain('data-pip-shape="player"');
  });
});
