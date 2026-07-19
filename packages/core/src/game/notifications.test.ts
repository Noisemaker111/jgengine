import { describe, expect, test } from "bun:test";

import { createNotificationCenter } from "./notifications";

function center() {
  let clock = 1000;
  return createNotificationCenter({ now: () => (clock += 1) });
}

describe("createNotificationCenter", () => {
  test("push prepends newest-first and defaults kind to info", () => {
    const c = center();
    c.push({ title: "First" });
    const b = c.push({ kind: "danger", title: "Second", body: "watch out" });
    const list = c.list();
    expect(list[0]!.id).toBe(b.id); // newest first
    expect(list[0]!.kind).toBe("danger");
    expect(list[1]!.kind).toBe("info");
  });

  test("unread tracking: count, markRead, markAllRead", () => {
    const c = center();
    const a = c.push({ title: "A" });
    c.push({ title: "B" });
    expect(c.unreadCount()).toBe(2);
    c.markRead(a.id);
    expect(c.unreadCount()).toBe(1);
    c.markAllRead();
    expect(c.unreadCount()).toBe(0);
  });

  test("filter by kind and unreadOnly", () => {
    const c = center();
    const trade = c.push({ kind: "trade", title: "Sold" });
    c.push({ kind: "quest", title: "Updated" });
    c.markRead(trade.id);
    expect(c.list({ kind: "trade" })).toHaveLength(1);
    expect(c.list({ unreadOnly: true })).toHaveLength(1);
    expect(c.list({ kind: "trade", unreadOnly: true })).toHaveLength(0);
  });

  test("cap keeps only the newest entries", () => {
    const c = createNotificationCenter({ now: () => 0, cap: 2 });
    c.push({ title: "1" });
    c.push({ title: "2" });
    c.push({ title: "3" });
    const list = c.list();
    expect(list).toHaveLength(2);
    expect(list.map((entry) => entry.title)).toEqual(["3", "2"]);
  });

  test("unfiltered list keeps a stable identity until a change", () => {
    const c = center();
    c.push({ title: "A" });
    const first = c.list();
    expect(c.list()).toBe(first);
    c.push({ title: "B" });
    expect(c.list()).not.toBe(first);
  });

  test("remove, clear, and snapshot/restore round-trip", () => {
    const c = center();
    const a = c.push({ title: "A" });
    c.push({ title: "B", kind: "warning" });
    const snap = JSON.parse(JSON.stringify(c.snapshot()));
    expect(c.remove(a.id)).toBe(true);
    expect(c.list()).toHaveLength(1);

    const c2 = center();
    c2.restore(snap);
    expect(c2.list()).toHaveLength(2);
    expect(c2.list()[0]!.kind).toBe("warning");
  });

  test("subscribe fires on changes and stops after unsubscribe", () => {
    const c = center();
    let hits = 0;
    const off = c.subscribe(() => { hits += 1; });
    c.push({ title: "A" });
    c.markAllRead();
    off();
    c.push({ title: "B" });
    expect(hits).toBe(2);
  });
});
