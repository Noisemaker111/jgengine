import { expect, test } from "bun:test";

import { CONSOLE_CAPACITY, createEditorConsoleStore } from "./consoleStore";

test("log appends entries with severity, source, and injected time", () => {
  let now = 1000;
  const store = createEditorConsoleStore(() => now);
  store.log("info", "ui", "Copied 2 objects");
  now = 2000;
  store.log("error", "save", "Save failed: disk");
  const entries = store.getEntries();
  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({ severity: "info", source: "ui", message: "Copied 2 objects", at: 1000 });
  expect(entries[1]).toMatchObject({ severity: "error", source: "save", at: 2000 });
  expect(store.counts()).toEqual({ info: 1, warning: 0, error: 1 });
});

test("log notifies subscribers and clear empties once", () => {
  const store = createEditorConsoleStore(() => 0);
  let notified = 0;
  store.subscribe(() => (notified += 1));
  store.log("warning", "rpc", "slow call");
  expect(notified).toBe(1);
  store.clear();
  expect(store.getEntries()).toHaveLength(0);
  expect(notified).toBe(2);
  store.clear();
  expect(notified).toBe(2);
});

test("the log is bounded to CONSOLE_CAPACITY entries", () => {
  const store = createEditorConsoleStore(() => 0);
  for (let index = 0; index < CONSOLE_CAPACITY + 25; index += 1) {
    store.log("info", "ui", `event ${index}`);
  }
  const entries = store.getEntries();
  expect(entries).toHaveLength(CONSOLE_CAPACITY);
  expect(entries[0]?.message).toBe("event 25");
  expect(entries[entries.length - 1]?.message).toBe(`event ${CONSOLE_CAPACITY + 24}`);
});
