import { createDayTicker } from "@jgengine/core/crafting/crop";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { Building, DistrictCharter, DistrictMood, Lens, Plaza, Tool } from "./game/catalog";
import { CITY_TEMPLATES, MOOD_DEFS, readCityLibrary, writeCityLibrary, type CitySaveRecord } from "./game/city/library";
import {
  activeLens,
  activeMood,
  advanceGrowth,
  ageBuildingsDaily,
  bumpLibraryRevision,
  captureCity,
  cityDay,
  loadCity,
  pushToast,
  resolveCharter,
  setMood,
  setWelcomeOpen,
  toggleFocusMode,
  toggleHelp,
  captureHistory,
  demolish,
  growSibling,
  initCity,
  pointerAction,
  redoCity,
  setLens,
  setTool,
  toggleSystems,
  undoCity,
  updateBuilding,
  updatePlaza,
  type PointerInput,
} from "./game/city/state";

const TOOL_COMMANDS: ReadonlyArray<[string, Tool]> = [
  ["toolSelect", "select"],
  ["toolDemolish", "demolish"],
  ["toolHousing", "housing"],
  ["toolWork", "work"],
  ["toolCivic", "civic"],
  ["toolCulture", "culture"],
  ["toolMixed", "mixed"],
  ["toolPlaza", "plaza"],
];

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("pauseToggle", {
    apply(state) {
      state.time.toggle();
    },
  });
  for (const [command, tool] of TOOL_COMMANDS) {
    ctx.game.commands.define(command, {
      apply(state) {
        setTool(state, tool);
      },
    });
  }
  ctx.game.commands.define<PointerInput>("site.pointer", {
    apply(state, input) {
      pointerAction(state, input);
    },
  });
  ctx.game.commands.define<{ id: string }>("site.demolish", {
    apply(state, input) {
      demolish(state, input.id);
    },
  });
  ctx.game.commands.define<{ id: string; patch: Partial<Building>; capture?: boolean }>("building.update", {
    apply(state, input) {
      if (input.capture === true) captureHistory(state);
      updateBuilding(state, input.id, input.patch);
    },
  });
  ctx.game.commands.define<{ id: string }>("building.duplicate", {
    apply(state, input) {
      growSibling(state, input.id);
    },
  });
  ctx.game.commands.define<{ id: string; patch: Partial<Plaza>; capture?: boolean }>("plaza.update", {
    apply(state, input) {
      if (input.capture === true) captureHistory(state);
      updatePlaza(state, input.id, input.patch);
    },
  });
  ctx.game.commands.define("cycleLens", {
    apply(state) {
      const order: Lens[] = ["material", "program", "structure", "daylight", "activity", "carbon"];
      const current = activeLens(state);
      setLens(state, order[(order.indexOf(current) + 1) % order.length]);
    },
  });
  ctx.game.commands.define<{ lens: Lens }>("site.lens", {
    apply(state, input) {
      setLens(state, input.lens);
    },
  });
  ctx.game.commands.define("systems.toggle", {
    apply(state) {
      toggleSystems(state);
    },
  });
  ctx.game.commands.define("undo", {
    apply(state) {
      undoCity(state);
    },
  });
  ctx.game.commands.define("redo", {
    apply(state) {
      redoCity(state);
    },
  });
  ctx.game.commands.define<{ eventId: keyof DistrictCharter; choice: number }>("charter.resolve", {
    apply(state, input) {
      resolveCharter(state, input.eventId, input.choice);
    },
  });
  ctx.game.commands.define("focusToggle", {
    apply(state) {
      toggleFocusMode(state);
    },
  });
  ctx.game.commands.define("helpToggle", {
    apply(state) {
      toggleHelp(state);
    },
  });
  ctx.game.commands.define("cycleMood", {
    apply(state) {
      const index = MOOD_DEFS.findIndex((def) => def.id === activeMood(state));
      setMood(state, MOOD_DEFS[(index + 1) % MOOD_DEFS.length].id);
    },
  });
  ctx.game.commands.define<{ mood: DistrictMood }>("site.mood", {
    apply(state, input) {
      setMood(state, input.mood);
    },
  });
  ctx.game.commands.define<{ open: boolean }>("city.menu", {
    apply(state, input) {
      setWelcomeOpen(state, input.open);
    },
  });
  ctx.game.commands.define<{ templateId: string }>("city.template", {
    apply(state, input) {
      const template = CITY_TEMPLATES.find((entry) => entry.id === input.templateId);
      if (template === undefined) return;
      loadCity(state, template.create(`${template.id}-${Date.now().toString(36)}`));
      pushToast(state, `${template.name} laid out on the drawing board`);
    },
  });
  ctx.game.commands.define<{ name?: string }>("city.save", {
    apply(state, input) {
      const records = readCityLibrary();
      const now = Date.now();
      const trimmed = input.name?.trim() ?? "";
      const record: CitySaveRecord = {
        id: `city-${now.toString(36)}`,
        name: trimmed !== "" ? trimmed : `My City · Day ${cityDay(state) + 1}`,
        createdAt: now,
        updatedAt: now,
        snapshot: captureCity(state),
      };
      if (writeCityLibrary([record, ...records])) {
        bumpLibraryRevision(state);
        pushToast(state, `${record.name} saved to this device`);
      } else {
        pushToast(state, "Could not save · browser storage is unavailable");
      }
    },
  });
  ctx.game.commands.define<{ recordId: string }>("city.open", {
    apply(state, input) {
      const record = readCityLibrary().find((entry) => entry.id === input.recordId);
      if (record === undefined) return;
      loadCity(state, record.snapshot);
      pushToast(state, `${record.name} reopened`);
    },
  });
  ctx.game.commands.define<{ recordId: string; name: string }>("city.rename", {
    apply(state, input) {
      const records = readCityLibrary().map((entry) =>
        entry.id === input.recordId ? { ...entry, name: input.name.trim(), updatedAt: Date.now() } : entry,
      );
      if (writeCityLibrary(records)) bumpLibraryRevision(state);
    },
  });
  ctx.game.commands.define<{ recordId: string }>("city.delete", {
    apply(state, input) {
      if (writeCityLibrary(readCityLibrary().filter((entry) => entry.id !== input.recordId))) {
        bumpLibraryRevision(state);
        pushToast(state, "Saved city removed from this device");
      }
    },
  });
  initCity(ctx);
  const dayTicker = createDayTicker(ctx.time.calendar().day);
  ctx.time.every(1, () => {
    advanceGrowth(ctx);
    ageBuildingsDaily(ctx, dayTicker.tick(ctx.time.calendar().day));
  });
}

export function onNewPlayer(_ctx: GameContext): void {}

export function onTick(_ctx: GameContext, _dt: number): void {}
