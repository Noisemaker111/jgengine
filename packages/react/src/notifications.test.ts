import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NotificationBell, NotificationCenter } from "./notifications";
import { createNotificationCenter } from "@jgengine/core/game/notifications";

function seeded() {
  const store = createNotificationCenter({ now: () => 1000 });
  store.push({ kind: "success", title: "Trade complete", body: "Sold 3 pelts" });
  const read = store.push({ kind: "info", title: "Welcome" });
  store.markRead(read.id);
  return store;
}

describe("NotificationBell", () => {
  test("shows the unread count badge", () => {
    const html = renderToStaticMarkup(createElement(NotificationBell, { store: seeded() }));
    expect(html).toContain("data-notification-bell");
    expect(html).toContain("data-notification-badge");
    expect(html).toContain(">1<"); // one unread of two
  });

  test("no badge when nothing is unread", () => {
    const store = createNotificationCenter({ now: () => 0 });
    const e = store.push({ title: "x" });
    store.markRead(e.id);
    const html = renderToStaticMarkup(createElement(NotificationBell, { store }));
    expect(html).not.toContain("data-notification-badge");
  });
});

describe("NotificationCenter", () => {
  test("lists entries newest-first with kind, read state, and controls", () => {
    const html = renderToStaticMarkup(createElement(NotificationCenter, { store: seeded(), formatTime: () => "now" }));
    expect(html).toContain("data-notification-center");
    expect(html).toContain('data-kind="success"');
    expect(html).toContain('data-read="true"'); // the Welcome entry
    expect(html).toContain('data-read="false"'); // the Trade entry
    expect(html).toContain("Sold 3 pelts");
    expect(html).toContain("data-notification-mark-all");
    expect(html).toContain("(1)"); // unread count in header
  });

  test("empty state", () => {
    const store = createNotificationCenter({ now: () => 0 });
    const html = renderToStaticMarkup(createElement(NotificationCenter, { store, emptyLabel: "Nothing here" }));
    expect(html).toContain("Nothing here");
  });
});
