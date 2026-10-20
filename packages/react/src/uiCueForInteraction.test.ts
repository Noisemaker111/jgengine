import { describe, expect, test } from "bun:test";

import { uiCueForInteraction } from "./uiCues";

describe("uiCueForInteraction", () => {
  test("activating plays the primitive's named cue, else click", () => {
    expect(uiCueForInteraction({ kind: "activate", source: "button" })).toBe("click");
    expect(uiCueForInteraction({ kind: "activate", source: "button", cue: "confirm" })).toBe("confirm");
    expect(uiCueForInteraction({ kind: "activate", source: "button", cue: "not-a-cue" })).toBe("click");
  });

  test("hover sounds only on buttons and action slots", () => {
    expect(uiCueForInteraction({ kind: "hover", source: "button" })).toBe("hover");
    expect(uiCueForInteraction({ kind: "hover", source: "action" })).toBe("hover");
    expect(uiCueForInteraction({ kind: "hover", source: "panel" })).toBeNull();
  });

  test("panels open and close; press and focus stay silent", () => {
    expect(uiCueForInteraction({ kind: "open", source: "window" })).toBe("open");
    expect(uiCueForInteraction({ kind: "close", source: "panel" })).toBe("close");
    expect(uiCueForInteraction({ kind: "press", source: "button" })).toBeNull();
    expect(uiCueForInteraction({ kind: "focus", source: "button" })).toBeNull();
  });
});
