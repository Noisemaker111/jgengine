import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createPerfOverlaySample, overlayFps, PERF_OVERLAY_FRAMES, PerfOverlay } from "./perfOverlay.draw";

describe("perf overlay", () => {
  test("fps is frames over the time they took, across the filled ring", () => {
    const sample = createPerfOverlaySample();
    expect(overlayFps(sample)).toBe(0);
    for (let frame = 0; frame < 10; frame += 1) {
      sample.intervals[sample.head] = 20;
      sample.head = (sample.head + 1) % PERF_OVERLAY_FRAMES;
      sample.frames += 1;
    }
    expect(overlayFps(sample)).toBeCloseTo(50, 5);
  });

  test("renders a status panel with the graph", () => {
    const html = renderToStaticMarkup(createElement(PerfOverlay, { sample: createPerfOverlaySample() }));
    expect(html).toContain('data-perf-overlay=""');
    expect(html).toContain("<canvas");
  });
});
