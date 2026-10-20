import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TweenNumber, easeOutCubic, tweenAt } from "./tweenNumber";

describe("tween math", () => {
  test("ease-out cubic is clamped and front-loaded", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });

  test("tweenAt interpolates between endpoints in either direction", () => {
    expect(tweenAt(0, 100, 0)).toBe(0);
    expect(tweenAt(0, 100, 1)).toBe(100);
    expect(tweenAt(100, 0, 0.5)).toBeCloseTo(12.5);
  });
});

describe("TweenNumber", () => {
  test("renders the formatted value with tabular digits and no flash on first paint", () => {
    const html = renderToStaticMarkup(createElement(TweenNumber, { value: 12500 }));
    expect(html).toContain((12500).toLocaleString());
    expect(html).toContain("tabular-nums");
    expect(html).not.toContain("data-jg-delta=");
  });

  test("uses a custom formatter", () => {
    expect(renderToStaticMarkup(createElement(TweenNumber, { value: 3, format: (v: number) => `$${v}` }))).toContain("$3");
  });
});
