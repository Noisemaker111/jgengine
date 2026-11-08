import { describe, expect, test } from "bun:test";

import {
  cpuBusyPercent,
  readinessTimeoutLine,
  isStaleCaptureFailure,
  retrySettleMs,
  shouldRetryCapture,
} from "./capture-retry";

describe("isStaleCaptureFailure", () => {
  test("matches the post-HMR start-menu symptom (case-insensitive)", () => {
    expect(
      isStaleCaptureFailure(
        "play-mode capture reached ready with a start menu still on screen — declare the game's start commands",
      ),
    ).toBe(true);
    expect(isStaleCaptureFailure("A START MENU STILL ON SCREEN")).toBe(true);
  });

  test("matches the readiness timeout (rebuild still in flight)", () => {
    expect(isStaleCaptureFailure("timed out waiting for data-jg-capture=ready (60000ms)")).toBe(true);
  });

  test("does not match deterministic config errors a reload cannot fix", () => {
    expect(isStaleCaptureFailure('unknown capture state "boss" for the-robots')).toBe(false);
    expect(isStaleCaptureFailure('capture command "character.pick" is not registered')).toBe(false);
    expect(isStaleCaptureFailure("HUD OVERFLOW: panels escape the viewport")).toBe(false);
    expect(isStaleCaptureFailure("Page.captureScreenshot returned empty data")).toBe(false);
  });
});

describe("shouldRetryCapture", () => {
  test("retries a stale failure while budget remains", () => {
    expect(
      shouldRetryCapture({
        attempt: 1,
        maxAttempts: 2,
        message: "a start menu still on screen",
      }),
    ).toBe(true);
  });

  test("does not retry once the attempt budget is exhausted", () => {
    expect(
      shouldRetryCapture({
        attempt: 2,
        maxAttempts: 2,
        message: "a start menu still on screen",
      }),
    ).toBe(false);
  });

  test("never retries a deterministic config error even with budget left", () => {
    expect(
      shouldRetryCapture({
        attempt: 1,
        maxAttempts: 3,
        message: 'unknown capture state "boss"',
      }),
    ).toBe(false);
  });

  test("guards against non-finite counters", () => {
    expect(
      shouldRetryCapture({
        attempt: Number.NaN,
        maxAttempts: 2,
        message: "a start menu still on screen",
      }),
    ).toBe(false);
  });
});

describe("retrySettleMs", () => {
  test("scales linearly with the failed-attempt number", () => {
    expect(retrySettleMs(1, 1_000)).toBe(1_000);
    expect(retrySettleMs(2, 1_000)).toBe(2_000);
  });

  test("uses the default base and clamps degenerate input", () => {
    expect(retrySettleMs(1)).toBe(1_500);
    expect(retrySettleMs(0)).toBe(1_500);
    expect(retrySettleMs(Number.NaN)).toBe(1_500);
    expect(retrySettleMs(2, -5)).toBe(3_000);
  });
});

describe("a readiness timeout names its cause in one line", () => {
  const base = { waitedMs: 120_000, url: "http://127.0.0.1:4845/?game=harbor-heat" };

  test("a busy PC is named, with what to do", () => {
    const line = readinessTimeoutLine({ ...base, status: "loading", href: "http://127.0.0.1:4845/?game=harbor-heat", cpuBusy: 96 });
    expect(line).toBe('timed out waiting for data-jg-capture=ready after 120s: the page was still "loading"; the PC\'s CPU was 96% busy throughout, so rerun when it is quieter or pass a longer --timeout');
    expect(isStaleCaptureFailure(line)).toBe(true);
  });

  test("a page that never loaded names the server that stopped answering", () => {
    const line = readinessTimeoutLine({ ...base, status: null, href: "chrome-error://chromewebdata/", cpuBusy: 20 });
    expect(line).toContain("the page never loaded: nothing answered at http://127.0.0.1:4845, so the dev server is gone");
  });

  test("a page that never started the handshake says so", () => {
    expect(readinessTimeoutLine({ ...base, status: null, href: base.url, cpuBusy: 10 })).toContain("never started the capture handshake");
  });

  test("CPU busy share comes from idle time across the window", () => {
    expect(cpuBusyPercent({ idle: 100, total: 1_000 }, { idle: 150, total: 2_000 })).toBe(95);
    expect(cpuBusyPercent({ idle: 0, total: 0 }, { idle: 0, total: 0 })).toBe(0);
  });
});
