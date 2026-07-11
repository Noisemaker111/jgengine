import { describe, expect, test } from "bun:test";

function trackTimeouts() {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  return {
    schedule(cb: () => void, ms: number) {
      const handle = setTimeout(() => {
        timers.delete(handle);
        cb();
      }, ms);
      timers.add(handle);
      return handle;
    },
    dispose() {
      for (const handle of timers) clearTimeout(handle);
      timers.clear();
    },
    size() {
      return timers.size;
    },
  };
}

describe("projectile tracer timer cleanup", () => {
  test("dispose clears pending timeouts before they fire", async () => {
    let fired = 0;
    const tracker = trackTimeouts();
    tracker.schedule(() => {
      fired += 1;
    }, 50);
    expect(tracker.size()).toBe(1);
    tracker.dispose();
    expect(tracker.size()).toBe(0);
    await Bun.sleep(80);
    expect(fired).toBe(0);
  });
});
