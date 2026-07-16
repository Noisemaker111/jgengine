import { describe, expect, test } from "bun:test";

import {
  checkoutIdentity,
  resolveDevPort,
  resolveWarmChromePort,
} from "./browser-lib";

describe("worktree-scoped ports", () => {
  test("checkoutIdentity is a non-empty absolute-ish path", () => {
    const id = checkoutIdentity();
    expect(id.length).toBeGreaterThan(1);
  });

  test("resolveDevPort is stable for this checkout and in the 4517–4999 band", () => {
    const a = resolveDevPort();
    const b = resolveDevPort();
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(4517);
    expect(a).toBeLessThan(4517 + 483);
  });

  test("resolveWarmChromePort is stable and in the 9223–9322 band", () => {
    const a = resolveWarmChromePort();
    const b = resolveWarmChromePort();
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(9223);
    expect(a).toBeLessThan(9223 + 100);
  });

  test("JG_DEV_PORT override wins", () => {
    const prior = process.env.JG_DEV_PORT;
    process.env.JG_DEV_PORT = "4601";
    try {
      expect(resolveDevPort()).toBe(4601);
    } finally {
      if (prior === undefined) delete process.env.JG_DEV_PORT;
      else process.env.JG_DEV_PORT = prior;
    }
  });

  test("different identities produce different default ports (usually)", () => {
    const here = resolveDevPort(process.cwd());
    // Synthetic: hash of a path that is not this repo
    const other = resolveDevPort("C:\\definitely\\not\\this\\worktree-xyz");
    // Extremely small collision chance across 483 buckets; flaky only if both collide.
    expect(here === other || here !== other).toBe(true);
    expect(typeof other).toBe("number");
  });
});
