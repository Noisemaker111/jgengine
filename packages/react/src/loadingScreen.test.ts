import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LoadingScreen } from "./loadingScreen";

describe("LoadingScreen", () => {
  test("renders a labelled progress bar with a real value and a tip", () => {
    const html = renderToStaticMarkup(
      createElement(LoadingScreen, { progress: 0.42, tips: ["Parry the second swing", "Sell spare ore"], title: "Entering the deep" }),
    );
    expect(html).toContain("Entering the deep");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain("42%");
    expect(html).toContain("data-loading-tip");
    expect(html).toContain("TIP");
  });

  test("an indeterminate bar reports no value", () => {
    const html = renderToStaticMarkup(createElement(LoadingScreen, {}));
    expect(html).toContain('role="progressbar"');
    expect(html).not.toContain("aria-valuenow");
  });

  test("a ready screen offers the continue affordance", () => {
    const html = renderToStaticMarkup(createElement(LoadingScreen, { progress: 1, ready: true }));
    expect(html).toContain("data-loading-continue");
    expect(html).toContain("Press any key to continue");
    expect(html).toContain("100%");
  });
});
