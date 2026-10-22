import { describe, expect, test } from "bun:test";

import { createGameSave } from "@jgengine/core/game/gameSave";
import { createSaveSlots } from "@jgengine/core/game/saveSlots";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import {
  formatSavePlaytime,
  gameSaveSlotSource,
  refreshSaveSlots,
  saveSlotMeta,
} from "@jgengine/core/game/saveSlotIndex";

const DOC = {
  version: 1,
  game: "beacon-bastion",
  savedAt: 1_700_000_000_000,
  time: 420,
  playtime: 15_120,
  rng: null,
  systems: {},
};

describe("formatSavePlaytime", () => {
  test("reads as hours and minutes, minutes, or under a minute", () => {
    expect(formatSavePlaytime(15_120)).toBe("4h 12m");
    expect(formatSavePlaytime(780)).toBe("13m");
    expect(formatSavePlaytime(12)).toBe("< 1m");
    expect(formatSavePlaytime(-5)).toBe("< 1m");
  });
});

describe("saveSlotMeta", () => {
  test("names the slot, keeps the saved time and adds the playtime chip", () => {
    const meta = saveSlotMeta("slot-2", DOC);
    expect(meta).toEqual({ id: "slot-2", name: "slot-2", empty: false, savedAt: DOC.savedAt, meta: { playtime: "4h 12m" } });
  });

  test("caller name and extra chips win over the defaults", () => {
    const meta = saveSlotMeta("slot-2", { ...DOC, systems: { keep: { level: 8 } } }, {
      nameOf: () => "Mara",
      metaOf: (_slot, document) => ({ level: (document.systems.keep as { level: number }).level }),
    });
    expect(meta.name).toBe("Mara");
    expect(meta.meta).toEqual({ playtime: "4h 12m", level: 8 });
  });
});

describe("refreshSaveSlots", () => {
  const makeSave = (now: () => number, backend = memorySaveBackend()) =>
    createGameSave({
      backend,
      game: "beacon-bastion",
      now,
      playtime: () => 4_000,
    });

  test("fills the index from the save documents a game actually wrote", async () => {
    let clock = 1_700_000_000_000;
    const save = makeSave(() => clock);
    await save.save();
    clock += 5_000;
    await save.switchSlot("slot-2");
    clock += 5_000;
    await save.save();

    const model = createSaveSlots({ now: () => clock, slots: [{ id: "default", empty: true }, { id: "slot-2", empty: true }, { id: "slot-3", empty: true }] });
    const result = await refreshSaveSlots(gameSaveSlotSource(save), model, { nameOf: (slot) => `Save ${slot}` });
    expect(result.saved).toEqual(["default", "slot-2"]);
    expect(model.get("default")?.name).toBe("Save default");
    expect(model.get("default")?.meta.playtime).toBe("1h 6m");
    expect(model.get("slot-2")?.savedAt).toBe(clock);
    expect(model.mostRecent()?.id).toBe("slot-2");
    expect(model.get("slot-3")?.empty).toBe(true);
  });

  test("clears a slot whose document was deleted", async () => {
    const backend = memorySaveBackend();
    const save = makeSave(() => 1_700_000_000_000, backend);
    await save.save();
    const model = createSaveSlots({ slots: [{ id: "default", empty: true }] });
    await refreshSaveSlots(gameSaveSlotSource(save), model);
    expect(model.get("default")?.empty).toBe(false);
    await backend.remove("game-save:beacon-bastion:default");
    const after = await refreshSaveSlots(gameSaveSlotSource(save), model);
    expect(after.filled).toEqual([]);
    expect(model.get("default")?.empty).toBe(true);
  });

  test("peek reads a slot without applying it", async () => {
    const save = makeSave(() => 1_700_000_000_000);
    const restoreCalls: unknown[] = [];
    save.register({ name: "keeper", snapshot: () => ({ level: 8 }), restore: (next) => void restoreCalls.push(next) });
    await save.save();
    const document = await save.peek("default");
    expect(document?.systems.keeper).toEqual({ level: 8 });
    expect(restoreCalls).toEqual([]);
  });
});
