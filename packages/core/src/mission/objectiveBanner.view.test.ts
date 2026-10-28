import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createObjectiveBanner } from "./objectiveBanner";
import { ObjectiveBannerHost } from "./objectiveBanner.view";

function announced() {
  const controller = createObjectiveBanner({ now: () => 0 });
  controller.announce({ title: "Gather stone", subtitle: "Next: Craft a Stone Pick" });
  return controller;
}

describe("ObjectiveBannerHost", () => {
  test("covers the screen by default", () => {
    const html = renderToStaticMarkup(createElement(ObjectiveBannerHost, { controller: announced(), animate: false }));
    expect(html).toContain('data-placement="overlay"');
    expect(html).toContain("position:absolute");
    expect(html).toContain("Gather stone");
  });

  test("inline lays out in its parent so a HUD slot can stack it", () => {
    const html = renderToStaticMarkup(createElement(ObjectiveBannerHost, { controller: announced(), animate: false, placement: "inline" }));
    expect(html).toContain('data-placement="inline"');
    expect(html).not.toContain("position:absolute");
    expect(html).toContain("Next: Craft a Stone Pick");
  });
});
