import { describe, expect, test } from "bun:test";

import { shouldEmitTireSmoke } from "./driving";

describe("shouldEmitTireSmoke (#1519)", () => {
  test("lawn crawls and soft scrub do not smoke", () => {
    expect(shouldEmitTireSmoke({ slip: 0.4, wheelspin: false, speed: 8, throttle: 1 })).toBe(false);
    expect(shouldEmitTireSmoke({ slip: 0.6, wheelspin: true, speed: 7, throttle: 1 })).toBe(false);
    expect(shouldEmitTireSmoke({ slip: 0.9, wheelspin: false, speed: 10, throttle: 0.2 })).toBe(false);
  });

  test("real slides and high-speed launch spin do smoke", () => {
    expect(shouldEmitTireSmoke({ slip: 0.8, wheelspin: false, speed: 16, throttle: 0.3 })).toBe(true);
    expect(shouldEmitTireSmoke({ slip: 0.2, wheelspin: true, speed: 14, throttle: 0.9 })).toBe(true);
  });
});
