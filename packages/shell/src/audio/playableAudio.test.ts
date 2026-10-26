import { describe, expect, test } from "bun:test";

import { DEFAULT_UI_CUE_SOUNDS } from "@jgengine/core/ui/uiCues";
import { UI_KITS } from "@jgengine/core/ui/kit/uiKits.view";

import type { PlayableGame } from "../registry";
import { kitCueOverrides, resolvePlayableAudio } from "./playableAudio";

function playable(fields: Partial<PlayableGame>): PlayableGame {
  return { game: { name: "kit-test", input: { interact: ["KeyE"] } }, ...fields } as unknown as PlayableGame;
}

describe("UI kit sounds", () => {
  test("a game's kit replaces the default UI cues", () => {
    const audio = resolvePlayableAudio(playable({ uiKit: "paper" }));
    expect(audio.sounds["ui.click"]?.synth).toEqual(UI_KITS.paper.sounds.click?.synth);
    expect(audio.sounds["ui.click"]?.synth).not.toEqual(DEFAULT_UI_CUE_SOUNDS.click.synth);
  });

  test("the game's own uiCues still win over the kit, and false silences everything", () => {
    const own = { ...DEFAULT_UI_CUE_SOUNDS.deny };
    const overrides = kitCueOverrides(playable({ uiKit: "ink", audio: { uiCues: { deny: own, hover: false } } } as Partial<PlayableGame>));
    expect(overrides === false ? null : overrides?.deny).toBe(own);
    expect(overrides === false ? null : overrides?.hover).toBe(false);
    expect(overrides === false ? null : overrides?.click).toBe(UI_KITS.ink.sounds.click);
    expect(kitCueOverrides(playable({ uiKit: "ink", audio: { uiCues: false } } as Partial<PlayableGame>))).toBe(false);
    expect(kitCueOverrides(playable({}))).toBeUndefined();
  });
});
