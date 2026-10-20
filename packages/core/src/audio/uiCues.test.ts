import { describe, expect, test } from "bun:test";

import { DEFAULT_UI_CUE_SOUNDS, UI_CUES, uiCueSoundId, withUiCueSounds } from "./uiCues";
import { patchDuration } from "./synth";

describe("withUiCueSounds", () => {
  test("adds every default cue on the ui bus", () => {
    const { sounds, buses } = withUiCueSounds({ hit: { id: "hit", bus: "sfx", url: "hit.ogg" } }, undefined);
    for (const cue of UI_CUES) expect(sounds[uiCueSoundId(cue)]).toMatchObject({ bus: "ui", positional: false });
    expect(sounds.hit?.url).toBe("hit.ogg");
    expect(buses).toEqual({ ui: { id: "ui", gain: 0.8 } });
  });

  test("a game sound named ui.<cue> wins, then overrides, and false silences", () => {
    const own = { id: "ui.click", bus: "sfx", url: "click.ogg" };
    const { sounds } = withUiCueSounds({ "ui.click": own }, { sfx: { id: "sfx" } }, {
      click: { id: "x", bus: "ui", url: "ignored.ogg" },
      deny: { id: "x", bus: "sfx", url: "deny.ogg" },
      hover: false,
    });
    expect(sounds["ui.click"]).toBe(own);
    expect(sounds["ui.deny"]).toMatchObject({ id: "ui.deny", url: "deny.ogg" });
    expect(sounds["ui.hover"]).toBeUndefined();
  });

  test("false keeps the catalog and buses untouched", () => {
    const { sounds, buses } = withUiCueSounds({}, { music: { id: "music" } }, false);
    expect(sounds).toEqual({});
    expect(buses).toEqual({ music: { id: "music" } });
  });

  test("a game-declared ui bus keeps its gain", () => {
    expect(withUiCueSounds({}, { ui: { id: "ui", gain: 0.3 } }).buses).toEqual({ ui: { id: "ui", gain: 0.3 } });
  });

  test("default patches stay short", () => {
    for (const cue of UI_CUES) expect(patchDuration(DEFAULT_UI_CUE_SOUNDS[cue].synth!)).toBeLessThan(0.45);
  });
});
