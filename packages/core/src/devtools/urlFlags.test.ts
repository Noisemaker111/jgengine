import { afterEach, describe, expect, test } from "bun:test";

import { readUrlFlag, readUrlParam, subscribeUrlChange, writeUrlParam } from "./urlFlags";

/** Minimal window stub with a mutable URL and a popstate listener set, mirroring history.replaceState. */
function installWindow(href: string) {
  const listeners = new Set<() => void>();
  const win = {
    location: {
      get href() {
        return href;
      },
      get search() {
        const q = href.indexOf("?");
        const hash = href.indexOf("#");
        const end = hash === -1 ? href.length : hash;
        return q === -1 || q > end ? "" : href.slice(q, end);
      },
    },
    history: {
      state: { some: "state" },
      replaceState(_state: unknown, _unused: string, url: string) {
        href = url;
      },
    },
    addEventListener(type: string, listener: () => void) {
      if (type === "popstate") listeners.add(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      if (type === "popstate") listeners.delete(listener);
    },
  };
  (globalThis as { window?: unknown }).window = win;
  return {
    firePopstate: () => listeners.forEach((l) => l()),
    href: () => href,
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("urlFlags", () => {
  test("reads params and flags from the query string", () => {
    installWindow("https://app.test/play?mode=editor&debug=1");
    expect(readUrlParam("mode")).toBe("editor");
    expect(readUrlFlag("debug")).toBe(true);
    expect(readUrlFlag("missing")).toBe(false);
  });

  test("treats explicit off values as a cleared flag", () => {
    installWindow("https://app.test/play?debug=0&trace=false");
    expect(readUrlFlag("debug")).toBe(false);
    expect(readUrlFlag("trace")).toBe(false);
  });

  test("adds a param while preserving the rest of the query and the hash", () => {
    const win = installWindow("https://app.test/play?seed=42#scene");
    writeUrlParam("mode", "editor");
    expect(win.href()).toBe("https://app.test/play?seed=42&mode=editor#scene");
  });

  test("removes a param without touching the others", () => {
    const win = installWindow("https://app.test/play?mode=editor&seed=42");
    writeUrlParam("mode", null);
    expect(win.href()).toBe("https://app.test/play?seed=42");
  });

  test("skips the write when the URL already matches", () => {
    const win = installWindow("https://app.test/play?mode=editor");
    writeUrlParam("mode", "editor");
    expect(win.href()).toBe("https://app.test/play?mode=editor");
    writeUrlParam("absent", null);
    expect(win.href()).toBe("https://app.test/play?mode=editor");
  });

  test("subscribeUrlChange fires on popstate and unsubscribes", () => {
    const win = installWindow("https://app.test/play");
    let hits = 0;
    const off = subscribeUrlChange(() => {
      hits += 1;
    });
    win.firePopstate();
    expect(hits).toBe(1);
    off();
    expect(win.listenerCount()).toBe(0);
  });

  test("no-ops without a DOM", () => {
    expect(readUrlParam("mode")).toBeNull();
    expect(readUrlFlag("debug")).toBe(false);
    expect(() => writeUrlParam("mode", "editor")).not.toThrow();
    expect(subscribeUrlChange(() => {})()).toBeUndefined();
  });
});
