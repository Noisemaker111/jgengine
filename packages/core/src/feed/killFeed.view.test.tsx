import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createEventTicker } from "./eventTicker";
import { KillFeed } from "./killFeed.view";

const ticker = () => {
  const feed = createEventTicker({ now: () => 0 });
  feed.push({ kind: "added", text: "ADDED: 3x Thatch", icon: "thatch" });
  feed.push({ kind: "added", text: "ADDED: 1x Wood", icon: "wood" });
  return feed;
};

describe("KillFeed", () => {
  test("draws the newest entry on top by default and the oldest first when asked", () => {
    const newest = renderToStaticMarkup(createElement(KillFeed, { ticker: ticker(), animate: false }));
    expect(newest.indexOf("Wood")).toBeLessThan(newest.indexOf("Thatch"));
    const oldest = renderToStaticMarkup(createElement(KillFeed, { ticker: ticker(), animate: false, oldestFirst: true }));
    expect(oldest.indexOf("Thatch")).toBeLessThan(oldest.indexOf("Wood"));
  });

  test("a game's own icon and row style replace the built-in chip", () => {
    const html = renderToStaticMarkup(
      createElement(KillFeed, {
        ticker: ticker(),
        animate: false,
        renderIcon: (entry) => createElement("img", { alt: entry.icon ?? "", "data-own-icon": "" }),
        rowStyle: { background: "none", borderLeft: "none" },
      }),
    );
    expect(html).toContain('alt="thatch"');
    expect(html).toContain("data-own-icon");
    expect(html).toContain("background:none");
    expect(html).toContain("border-left:none");
  });
});
