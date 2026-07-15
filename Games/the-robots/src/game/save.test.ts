import { afterEach, describe, expect, test } from "bun:test";
import { createSaveStore, memorySaveBackend } from "@jgengine/core/game/saveStore";

import { activeCharacter, pickCharacter, resetCharacterState, talentTree } from "./characters";
import type { RobotsSave } from "./save";

afterEach(() => resetCharacterState());

function newStore(backend = memorySaveBackend()) {
  return createSaveStore<RobotsSave>({
    backend,
    key: "the-robots",
    slot: "slot-0",
    initial: { characterId: null, talents: null },
  });
}

describe("the-robots build save", () => {
  test("captures and restores a character + talent build across a reload", async () => {
    const backend = memorySaveBackend();

    // Build a character with two ranks invested.
    pickCharacter("gunk");
    const tree = talentTree();
    if (tree === null) throw new Error("expected an active talent tree");
    tree.grantPoints(3);
    tree.allocate("sal_locked_loaded");
    tree.allocate("sal_locked_loaded");
    const store = newStore(backend);
    store.set({ characterId: activeCharacter()?.id ?? null, talents: tree.snapshot() });
    await store.save();

    // Fresh boot: nothing picked yet.
    resetCharacterState();
    expect(activeCharacter()).toBeNull();

    // Restore from the persisted slot.
    const reopened = newStore(backend);
    const save = await reopened.load();
    expect(save.characterId).toBe("gunk");
    const def = pickCharacter(save.characterId!);
    expect(def).not.toBeNull();
    const restored = talentTree();
    if (restored === null) throw new Error("expected a restored talent tree");
    if (save.talents !== null) restored.hydrate(save.talents);
    expect(restored.snapshot().ranks["sal_locked_loaded"]).toBe(2);
    expect(restored.pointsAvailable()).toBe(1);
  });

  test("an empty slot restores to no character", async () => {
    const save = await newStore().load();
    expect(save.characterId).toBeNull();
    expect(save.talents).toBeNull();
  });
});
