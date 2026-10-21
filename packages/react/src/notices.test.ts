import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createNoticeFeed, type Notice } from "@jgengine/core/game/notices";

import { NoticeStack, noticeAvoidShift, reconcileShown } from "./notices";
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

  test("sits above modal hosts by default and takes an offset over the safe area", () => {
    const feed = createNoticeFeed({ now: () => 0 });
    feed.push("Saved");
    const html = renderToStaticMarkup(createElement(NoticeStack, { feed, offset: 96 }));
    expect(html).toContain("z-index:85");
    expect(html).toContain("top:calc(var(--jg-safe-top, 0px) + 96px)");
    expect(renderToStaticMarkup(createElement(NoticeStack, { feed, zIndex: 30 }))).toContain("z-index:30");
  });

  test("renders nothing for an empty feed", () => {
    expect(renderToStaticMarkup(createElement(NoticeStack, { feed: createNoticeFeed() }))).toBe("");
  });
});

describe("noticeAvoidShift", () => {
  const container = { left: 0, top: 0, right: 1600, bottom: 900 };
  const stack = { left: 570, top: 126, right: 1030, bottom: 210 };
  const card = { kind: "hud" as const, rect: { left: 655, top: 62, right: 945, bottom: 232 } };

  test("moves a top stack below a HUD panel in its column", () => {
    expect(noticeAvoidShift("top", stack, 0, container, [card])).toBe(232 + 8 - 126);
    const moved = { ...stack, top: stack.top + 114, bottom: stack.bottom + 114 };
    expect(noticeAvoidShift("top", moved, 114, container, [card])).toBe(114);
  });

  test("ignores panels outside its column, empty panels, screens and tall regions", () => {
    const regions = [
      { kind: "hud" as const, rect: { left: 16, top: 16, right: 250, bottom: 120 } },
      { kind: "hud" as const, rect: { left: 700, top: 100, right: 700, bottom: 300 } },
      { kind: "screen" as const, rect: { left: 0, top: 0, right: 1600, bottom: 300 } },
      { kind: "hud" as const, rect: { left: 600, top: 0, right: 900, bottom: 800 } },
    ];
    expect(noticeAvoidShift("top", stack, 0, container, regions)).toBe(0);
    expect(noticeAvoidShift("center", stack, 0, container, [card])).toBe(0);
  });

  test("lifts a bottom stack above an action bar", () => {
    const bottomStack = { left: 570, top: 600, right: 1030, bottom: 720 };
    const bar = { kind: "hud" as const, rect: { left: 600, top: 700, right: 1000, bottom: 890 } };
    expect(noticeAvoidShift("bottom", bottomStack, 0, container, [bar])).toBe(720 - (700 - 8));
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
