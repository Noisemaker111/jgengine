import { describe, expect, test } from "bun:test";

import { mergeGamepadFrame, mergeGamepadInput } from "./gamepadMerge";

describe("gamepad input merge", () => {
  test("unions held actions and keeps the strongest analog value", () => {
    expect(
      mergeGamepadInput([
        { held: ["moveForward"], analog: { moveForward: 0.25 } },
        { held: ["jump"], analog: { moveForward: 0.8, turnRight: 0.4 } },
      ]),
    ).toEqual({
      held: ["moveForward", "jump"],
      analog: { moveForward: 0.8, turnRight: 0.4 },
    });
  });

  test("preserves the non-gamepad source while merging", () => {
    expect(mergeGamepadFrame({ held: ["fire"], analog: { fire: 1 } }, { held: ["jump"], analog: { jump: 1 } })).toEqual({
      held: ["fire", "jump"],
      analog: { fire: 1, jump: 1 },
    });
  });
});
