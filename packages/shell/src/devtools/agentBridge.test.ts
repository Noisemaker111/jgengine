import { describe, expect, test } from "bun:test";

import { waitForEditorHost } from "./agentBridge";

describe("waitForEditorHost", () => {
  test("resolves true as soon as the host goes live", async () => {
    let polls = 0;
    const live = await waitForEditorHost(() => ++polls >= 3, 1000, 10, async () => {});
    expect(live).toBe(true);
    expect(polls).toBe(3);
  });

  test("resolves false after the timeout", async () => {
    let slept = 0;
    const live = await waitForEditorHost(() => false, 50, 10, async (ms) => {
      slept += ms;
    });
    expect(live).toBe(false);
    expect(slept).toBe(50);
  });
});
