import { describe, expect, test } from "bun:test";

import { createGameContext } from "../runtime/gameContext";
import { defineGameDefinition } from "./defineGame";
import { createGameEvents } from "./events";
import { attachRefusalNotices, createNoticeFeed } from "./notices";

function clockFeed(options: { cap?: number } = {}) {
  let time = 1000;
  const feed = createNoticeFeed({ ...options, now: () => time });
  return { feed, advance: (ms: number) => { time += ms; } };
}

describe("createNoticeFeed", () => {
  test("push defaults to info and returns the live entry", () => {
    const { feed } = clockFeed();
    const notice = feed.push("Gates open");
    expect(notice).toMatchObject({ text: "Gates open", tone: "info", count: 1, at: 1000, expiresAt: 4200 });
    expect(feed.list()).toEqual([notice]);
  });

  test("repeats stack into one entry with a refreshed lifetime", () => {
    const { feed, advance } = clockFeed();
    const stacked: boolean[] = [];
    feed.onPush((_, merged) => stacked.push(merged));
    feed.push({ text: "Need gold", tone: "deny" });
    advance(1000);
    const again = feed.push({ text: "Need gold", tone: "deny" });
    expect(feed.list()).toHaveLength(1);
    expect(again).toMatchObject({ count: 2, at: 2000, expiresAt: 4400 });
    expect(stacked).toEqual([false, true]);
  });

  test("a custom key stacks changing text", () => {
    const { feed } = clockFeed();
    feed.push({ text: "Needs 40 more", tone: "deny", key: "gold" });
    feed.push({ text: "Needs 30 more", tone: "deny", key: "gold" });
    expect(feed.list().map((notice) => [notice.text, notice.count])).toEqual([["Needs 30 more", 2]]);
  });

  test("caps the list and expires by TTL", () => {
    const { feed, advance } = clockFeed({ cap: 2 });
    feed.push("a");
    feed.push("b");
    feed.push({ text: "c", ttlMs: 100 });
    expect(feed.list().map((notice) => notice.text)).toEqual(["b", "c"]);
    advance(150);
    feed.prune();
    expect(feed.list().map((notice) => notice.text)).toEqual(["b"]);
    advance(5000);
    feed.prune();
    expect(feed.list()).toEqual([]);
  });

  test("an expired notice does not stack; it starts fresh", () => {
    const { feed, advance } = clockFeed();
    const first = feed.push("x");
    advance(10_000);
    const second = feed.push("x");
    expect(second.id).not.toBe(first.id);
    expect(second.count).toBe(1);
  });

  test("list is stable between changes and subscribers fire on change", () => {
    const { feed } = clockFeed();
    let calls = 0;
    feed.subscribe(() => { calls += 1; });
    const before = feed.list();
    feed.prune();
    expect(feed.list()).toBe(before);
    feed.push("x");
    feed.dismiss(feed.list()[0]!.id);
    expect(calls).toBe(2);
  });

  test("snapshot, restore and retune", () => {
    const { feed } = clockFeed();
    feed.push("a");
    feed.push("b");
    const state = feed.snapshot();
    feed.clear();
    feed.restore(state);
    expect(feed.list().map((notice) => notice.text)).toEqual(["a", "b"]);
    feed.retune({ cap: 1 });
    expect(feed.list().map((notice) => notice.text)).toEqual(["b"]);
    expect(feed.push("c").id).toBe("notice-2");
  });
});

describe("attachRefusalNotices", () => {
  test("shows only refusals that carry a message, from the local player", () => {
    const events = createGameEvents();
    const { feed } = clockFeed();
    attachRefusalNotices(events, feed, { localUserId: () => "me" });
    events.emit("command.refused", { command: "build", reason: "no-gold", actor: null });
    events.emit("command.refused", { command: "build", reason: "no-gold", message: "Needs 40 more gold", actor: null });
    events.emit("command.refused", { command: "build", reason: "no-gold", message: "Needs 40 more gold", actor: "me" });
    events.emit("command.refused", { command: "build", reason: "no-gold", message: "Other player", actor: "them" });
    expect(feed.list().map((notice) => [notice.text, notice.tone, notice.count])).toEqual([["Needs 40 more gold", "deny", 2]]);
  });
});

describe("silent notices", () => {
  test("a silent push is marked, and a later audible push onto the same notice clears it", () => {
    const feed = createNoticeFeed({ now: () => 0 });
    expect(feed.push({ text: "Autosaved", silent: true }).silent).toBe(true);
    const stacked = feed.push("Autosaved");
    expect(stacked.count).toBe(2);
    expect("silent" in stacked).toBe(false);
    expect("silent" in feed.push("Plain")).toBe(false);
  });
});

describe("ctx.game.notices", () => {
  test("refused commands announce their reason and message", () => {
    const ctx = createGameContext({
      definition: defineGameDefinition({ name: "NoticeGame", multiplayer: "off" }),
      content: {},
      player: { userId: "p1", isNew: true },
    });
    ctx.game.commands.define("buy", {
      validate: () => ({ reason: "insufficient-gold", message: "Needs 40 more gold" }),
      apply: () => undefined,
    });
    ctx.game.commands.define("wave", { validate: () => ({ reason: "not-ready" }), apply: () => undefined });
    const refused: unknown[] = [];
    ctx.game.events.on("command.refused", (event) => refused.push(event));
    attachRefusalNotices(ctx.game.events, ctx.game.notices);

    expect(ctx.game.commands.run("buy", {})).toEqual({ status: "rejected", reason: "insufficient-gold", message: "Needs 40 more gold" });
    expect(ctx.game.commands.run("wave", {})).toStrictEqual({ status: "rejected", reason: "not-ready" });
    ctx.game.commands.runAs("p2", "buy", {});
    expect(refused).toEqual([
      { command: "buy", reason: "insufficient-gold", message: "Needs 40 more gold", actor: null },
      { command: "wave", reason: "not-ready", actor: null },
      { command: "buy", reason: "insufficient-gold", message: "Needs 40 more gold", actor: "p2" },
    ]);
    expect(ctx.game.notices.list().map((notice) => [notice.text, notice.count])).toEqual([["Needs 40 more gold", 2]]);
  });
});
