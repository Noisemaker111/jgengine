import { expect, test } from "bun:test";
import { captureDeadline, captureTimeout } from "./captureDeadline";

test("the shoot budget reaches the page, including software GL frames beyond 30 seconds", () => {
  const timeoutMs = captureTimeout(new URLSearchParams("capture=1&captureTimeout=90000"));
  let time = 0;
  const remaining = captureDeadline(timeoutMs, () => time);
  time = 20_000; // Canvas committed after modules/assets loaded.
  expect(remaining()).toBe(70_000);
  time += 2_500; // Capture settle.
  expect(remaining()).toBe(67_500);
  time = 58_820; // Observed CI frame completion, beyond the old per-stage timeout.
  expect(remaining()).toBe(31_180);
  time = 90_001;
  expect(remaining()).toBe(0);
});

test("editor and other stages cannot restart the host budget", () => {
  let time = 1_000;
  const remaining = captureDeadline(60_000, () => time);
  time += 35_000;
  expect(remaining()).toBe(25_000);
  time += 22_000;
  expect(remaining()).toBe(3_000);
  time += 3_000;
  expect(remaining()).toBe(0);
});

test("module loading before the handshake arms also spends the navigation budget", () => {
  let time = 35_000;
  const remaining = captureDeadline(90_000, () => time, 0);
  expect(remaining()).toBe(55_000);
  time = 90_000;
  expect(remaining()).toBe(0);
});

test("direct capture URLs have a finite default even with malformed budgets", () => {
  for (const raw of ["", "captureTimeout=", "captureTimeout=-1", "captureTimeout=NaN", "captureTimeout=Infinity"]) {
    expect(captureTimeout(new URLSearchParams(raw))).toBe(60_000);
  }
});
