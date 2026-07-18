import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "./defineGame";
import { dialogueSlot } from "./dialogue";
import { createGameContext } from "../runtime/gameContext";

function ctx(dialogue: boolean) {
  const definition = defineGameDefinition({
    name: "DialogueGame",
    multiplayer: "off",
    ...(dialogue ? { features: { dialogue: true } } : {}),
  });
  return createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
}

describe("features.dialogue", () => {
  test("builds ctx.game.dialogue and auto-registers dialogue.open/close", () => {
    const c = ctx(true);
    expect(c.game.dialogue).toBeDefined();
    expect(c.game.commands.has("dialogue.open")).toBe(true);
    expect(c.game.commands.has("dialogue.close")).toBe(true);
    expect(c.game.dialogue?.openId()).toBeNull();
  });

  test("dialogue.open command opens the id a talkable prompt carries, dialogue.close clears it", () => {
    const c = ctx(true);
    c.game.commands.run("dialogue.open", { id: "dlg_marco" });
    expect(c.game.dialogue?.openId()).toBe("dlg_marco");
    expect(dialogueSlot.read(c)).toBe("dlg_marco");

    c.game.commands.run("dialogue.close", {});
    expect(c.game.dialogue?.openId()).toBeNull();
    expect(dialogueSlot.read(c)).toBeUndefined();
  });

  test("ctx.game.dialogue.open writes the same slot React reads", () => {
    const c = ctx(true);
    c.game.dialogue?.open("dlg_sal");
    expect(dialogueSlot.read(c)).toBe("dlg_sal");
  });

  test("omitting the feature leaves ctx.game.dialogue and its commands off", () => {
    const c = ctx(false);
    expect(c.game.dialogue).toBeUndefined();
    expect(c.game.commands.has("dialogue.open")).toBe(false);
    expect(c.game.commands.has("dialogue.close")).toBe(false);
  });
});
