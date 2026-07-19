import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FastTravelMenu } from "./fastTravel";
import { createFastTravelNetwork } from "@jgengine/core/world/fastTravel";

function net() {
  return createFastTravelNetwork({
    now: () => 0,
    points: [
      { id: "home", name: "Home Camp", position: [0, 0], region: "Vale", icon: "🏕️", initial: true },
      { id: "ridge", name: "Windy Ridge", position: [30, 40], region: "Highlands" },
      { id: "port", name: "Salt Port", position: [3, 4], region: "Coast" },
    ],
  });
}

describe("FastTravelMenu", () => {
  test("lists discovered destinations grouped by region with a discovery counter", () => {
    const n = net();
    n.discover("port");
    const html = renderToStaticMarkup(
      createElement(FastTravelMenu, { network: n, from: [0, 0], currentId: "home" }),
    );
    expect(html).toContain("data-fast-travel");
    expect(html).toContain("2/3"); // home (initial) + port discovered of three
    expect(html).toContain('data-travel-point="home"');
    expect(html).toContain('data-travel-point="port"');
    expect(html).not.toContain('data-travel-point="ridge"'); // undiscovered
    expect(html).toContain('data-region="Vale"');
    expect(html).toContain('data-region="Coast"');
    expect(html).toContain("You are here"); // current location flagged
    expect(html).toContain("5m"); // port distance from origin
  });

  test("empty state when nothing but nothing is discovered", () => {
    const n = createFastTravelNetwork({ points: [{ id: "a", name: "A", position: [0, 0] }] });
    const html = renderToStaticMarkup(createElement(FastTravelMenu, { network: n, emptyLabel: "Nowhere yet" }));
    expect(html).toContain("Nowhere yet");
  });
});
