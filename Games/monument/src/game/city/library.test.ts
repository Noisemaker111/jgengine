import { describe, expect, test } from "bun:test";
import { defineGame } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { content } from "../content";
import { HALF, CELL } from "../catalog";
import { buildingBodies } from "./model";
import { CITY_TEMPLATES, readCityLibrary, snapshotSummary, writeCityLibrary, type CitySaveRecord, type LibraryStorage } from "./library";
import { activeCharter, activeMood, captureCity, cityBuildings, cityDay, cityPlazas, loadCity, welcomeOpen } from "./state";
import { onInit } from "../../loop";

function makeContext() {
  const ctx = createGameContext({
    definition: defineGame({ name: "Monument", assets: createAssetCatalog(), multiplayer: "off" }),
    content,
    player: { userId: "architect", isNew: true },
  });
  onInit(ctx);
  return ctx;
}

const memoryStorage = (): LibraryStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
};

describe("city templates", () => {
  test("four templates, three of them seeded ready cities", () => {
    expect(CITY_TEMPLATES.map((t) => t.id)).toEqual(["blank", "civic-basin", "garden-terraces", "campus-forum"]);
    const blank = CITY_TEMPLATES[0].create("t");
    expect(blank.buildings.length).toBe(0);
    const commons = CITY_TEMPLATES[1].create("t");
    expect(commons.buildings.length).toBe(13);
    expect(commons.plazas.length).toBe(4);
    const garden = CITY_TEMPLATES[2].create("t");
    expect(garden.buildings.length).toBe(15);
    expect(garden.mood).toBe("green");
    const campus = CITY_TEMPLATES[3].create("t");
    expect(campus.buildings.length).toBe(13);
    expect(campus.mood).toBe("university");
  });

  test("every template building sits on the grid and composes massing", () => {
    for (const template of CITY_TEMPLATES) {
      const city = template.create("probe");
      for (const b of city.buildings) {
        expect(Math.abs(b.x / CELL)).toBeLessThanOrEqual(HALF);
        expect(Math.abs(b.z / CELL)).toBeLessThanOrEqual(HALF);
        const bodies = buildingBodies(b);
        if (b.composition !== "ring") expect(bodies.length).toBeGreaterThan(0);
      }
    }
  });

  test("template ids are unique per prefix so two loads never collide", () => {
    const a = CITY_TEMPLATES[1].create("first");
    const b = CITY_TEMPLATES[1].create("second");
    const ids = new Set([...a.buildings.map((x) => x.id), ...b.buildings.map((x) => x.id)]);
    expect(ids.size).toBe(a.buildings.length + b.buildings.length);
  });
});

describe("save library", () => {
  test("round-trips records through structural storage with a cap", () => {
    const storage = memoryStorage();
    expect(readCityLibrary(storage)).toEqual([]);
    const snapshot = CITY_TEMPLATES[1].create("save");
    const records: CitySaveRecord[] = Array.from({ length: 35 }, (_, i) => ({
      id: `r-${i}`,
      name: `City ${i}`,
      createdAt: i,
      updatedAt: i,
      snapshot,
    }));
    expect(writeCityLibrary(records, storage)).toBe(true);
    const loaded = readCityLibrary(storage);
    expect(loaded.length).toBe(30);
    expect(loaded[0].name).toBe("City 0");
    expect(snapshotSummary(loaded[0].snapshot).structures).toBe(13);
  });

  test("corrupt storage degrades to an empty library", () => {
    const storage = memoryStorage();
    storage.setItem("jg-monument-city-library-v1", "{nonsense");
    expect(readCityLibrary(storage)).toEqual([]);
  });
});

describe("capture and load", () => {
  test("loading a template replaces the district and closes the menu", () => {
    const ctx = makeContext();
    expect(welcomeOpen(ctx)).toBe(true);
    expect(ctx.time.snapshot().paused).toBe(true);
    ctx.game.commands.run("city.template", { templateId: "garden-terraces" });
    expect(cityBuildings(ctx).length).toBe(15);
    expect(cityPlazas(ctx).length).toBe(5);
    expect(activeMood(ctx)).toBe("green");
    expect(welcomeOpen(ctx)).toBe(false);
    expect(ctx.time.snapshot().paused).toBe(false);
    const sceneIds = new Set(ctx.scene.object.list().map((o) => o.instanceId));
    for (const b of cityBuildings(ctx)) expect(sceneIds.has(b.id)).toBe(true);
  });

  test("capture then load restores the same city and clock day", () => {
    const ctx = makeContext();
    ctx.game.commands.run("city.template", { templateId: "civic-basin" });
    const saved = captureCity(ctx);
    ctx.game.commands.run("city.template", { templateId: "blank" });
    expect(cityBuildings(ctx).length).toBe(0);
    loadCity(ctx, saved);
    expect(cityBuildings(ctx).length).toBe(13);
    expect(cityDay(ctx) + 1).toBe(saved.day);
    expect(activeCharter(ctx)).toEqual(saved.charter);
  });
});
