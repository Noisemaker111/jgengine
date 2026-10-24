import { describe, expect, test } from "bun:test";

import { createGameMenuSound } from "./gameMenuSound";
import { ContinuePane, CreditsPane, NewCharacterPane, SAVE_SLOT_THUMBNAIL_KEY, SaveSlotCard, SaveSlotsPane } from "./gameMenuSaves";
import { shrinkCapture } from "./saveThumbnail";

describe("game menu parts", () => {
  test("the panes a game composes are exported", () => {
    for (const part of [SaveSlotCard, SaveSlotsPane, ContinuePane, NewCharacterPane, CreditsPane]) {
      expect(typeof part).toBe("function");
    }
    expect(SAVE_SLOT_THUMBNAIL_KEY).toBe("thumbnail");
  });

  test("a menu sound player is a no-op when audio is unavailable, and dispose is safe twice", () => {
    const sound = createGameMenuSound({ enabled: false });
    expect(() => sound.play("move")).not.toThrow();
    expect(() => sound.play("confirm")).not.toThrow();
    sound.dispose();
    sound.dispose();
  });

  test("a capture that is not an image data URL has no thumbnail", async () => {
    expect(await shrinkCapture(null)).toBeNull();
    expect(await shrinkCapture("blob:not-an-image")).toBeNull();
    expect(await shrinkCapture("")).toBeNull();
  });
});
