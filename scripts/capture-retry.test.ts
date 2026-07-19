import { describe, expect, test } from "bun:test";

import {
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
