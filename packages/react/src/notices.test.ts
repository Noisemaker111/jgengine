import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createNoticeFeed, type Notice } from "@jgengine/core/game/notices";

import { NoticeStack, reconcileShown } from "./notices";
import { playUiCue } from "./uiCues";

function notice(id: string, count = 1): Notice {
  return { id, text: id, tone: "info", key: id, count, at: 0, expiresAt: 1 };
}

describe("reconcileShown", () => {
  test("keeps removed notices in place as leaving and appends new ones", () => {
    const shown = reconcileShown([], [notice("a"), notice("b")]);
    const next = reconcileShown(shown, [notice("b", 2), notice("c")]);
    expect(next.map((entry) => [entry.notice.id, entry.notice.count, entry.leaving])).toEqual([
      ["a", 1, true],
      ["b", 2, false],
      ["c", 1, false],
    ]);
  });
});

describe("NoticeStack", () => {
  test("renders toned notices with a stack count and themed fallbacks", () => {
    const feed = createNoticeFeed({ now: () => 0 });
    feed.push({ text: "Needs 40 more gold", tone: "deny" });
    feed.push({ text: "Needs 40 more gold", tone: "deny" });
    feed.push({ text: "Wave cleared", tone: "success" });
    const html = renderToStaticMarkup(createElement(NoticeStack, { feed, placement: "bottom" }));
    expect(html).toContain('data-jg-notices="bottom"');
    expect(html).toContain('data-jg-notice="deny"');
    expect(html).toContain("Needs 40 more gold");
    expect(html).toContain("×2");
    expect(html).toContain("var(--jg-danger, #f26d6d)");
    expect(html).toContain("font-size:14px");
  });

  test("renders nothing for an empty feed", () => {
    expect(renderToStaticMarkup(createElement(NoticeStack, { feed: createNoticeFeed() }))).toBe("");
  });
});

describe("playUiCue", () => {
  test("plays ui.<cue> through the game audio seam and no-ops without a game", () => {
    const played: string[] = [];
    playUiCue({ game: { audio: { play: (sound: string) => played.push(sound) } } } as never, "deny");
    playUiCue(null, "click");
    expect(played).toEqual(["ui.deny"]);
  });
});
