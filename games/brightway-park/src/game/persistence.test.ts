import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { game } from "../game.config";
import { content } from "./content";
import { DAY_LENGTH } from "./catalog";
import { session } from "./session";
import { BUILDABLES } from "./objects/catalog";
import { MILESTONES } from "./milestones";
import { park } from "./park";
import { archiveSave, decodeSave, SAVE_KEY, snapshotPark, STORE_POLICY } from "./persistence";
import { closeDay } from "./sim/economy";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let records: Map<string, string>;
beforeEach(() => {
  records = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } });
});
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});
const runner = () => createHeadlessRunner({ definition: game.game, content, loop: game.game.loop, maxStepSeconds: 1 });

describe("park saves and real command boundaries", () => {
  test("the world store is the save: every store the park writes has a home", () => {
    expect(STORE_POLICY[park.store.key]?.kept).toBe("park-save");
    const live = runner();
    live.ui.invoke("park.start");
    expect(snapshotPark(live.ctx).world).toEqual(park.of(live.ctx).snapshot());
  });

  test("menu blocks shortcuts; build, refund, ticket and occupied cells survive reload", () => {
    const first = runner();
    first.ui.invoke("pickCarousel");
    expect(session.selectedTool).toBeNull();
    first.ui.invoke("park.start");
    // The drop tower is a lab topic: the world refuses it as locked.
    first.ui.invoke("build.select", { id: "ride_dropzone" });
    expect(session.selectedTool).toBeNull();
    first.ui.invoke("pickCarousel");
    const w = park.of(first.ctx);
    const cash = w.num("park.cash");
    first.ui.invoke("park.pointer", { point: [-40, 0, -40], object: null, entity: null });
    expect(w.num("park.cash")).toBe(cash - BUILDABLES.ride_carousel!.cost);
    const built = w.instances().at(-1)!;
    expect(built.kind).toBe("ride_carousel");
    // A second carousel on the same spot is refused: the cell is taken.
    first.ui.invoke("park.pointer", { point: [-40, 0, -40], object: null, entity: null });
    expect(w.instances().filter((entry) => entry.kind === "ride_carousel").length).toBe(2);
    for (let i = 0; i < 3; i += 1) first.ui.invoke("brightway.act", { action: "ticket_up" });
    first.ui.invoke("pauseToggle");
    const saved = snapshotPark(first.ctx);
    const nextRandom = first.ctx.rng();

    const second = runner();
    const v = park.of(second.ctx);
    expect(second.ctx.rng()).toBe(nextRandom);
    expect(session.started).toBe(false);
    expect(session.hasSave).toBe(true);
    expect(v.num("park.ticket")).toBe(11);
    expect(v.instance(built.id)).toEqual(built);
    expect(v.canPlace("deco_tree", { cell: built.cell! })?.reason).toBe("taken");
    expect(snapshotPark(second.ctx).guests).toEqual(saved.guests);
    expect(snapshotPark(second.ctx).staff).toEqual(saved.staff);
    expect(second.ctx.time.isPaused()).toBe(true);
    second.ui.invoke("park.start");
    second.ui.invoke("brightway.remove", { id: built.id });
    expect(v.num("park.cash")).toBe(saved.world.facts["park.cash"] as number + BUILDABLES.ride_carousel!.cost / 2);
    expect(v.canPlace("deco_tree", { cell: built.cell! })?.reason).not.toBe("taken");
  });

  test("midnight closes the day once and the day survives a reload", () => {
    const first = runner();
    first.ui.invoke("park.start");
    // Set up the last fraction before midnight through the published clock API.
    first.ctx.time.hydrate({ ...first.ctx.time.snapshot(), now: DAY_LENGTH - .01, paused: false });
    first.step(.02);
    const w = park.of(first.ctx);
    expect(w.num("park.day")).toBe(2);
    expect(w.num("park.revenue_today")).toBe(0);
    w.set("park.won", true);
    first.ui.invoke("park.save");
    const second = runner();
    expect(park.of(second.ctx).num("park.day")).toBe(2);
    second.ui.invoke("park.start");
    expect(second.ctx.time.isPaused()).toBe(true);
    second.ui.invoke("park.continue");
    expect(second.ctx.time.isPaused()).toBe(false);
    second.ctx.time.hydrate({ ...second.ctx.time.snapshot(), now: 2 * DAY_LENGTH - .01 });
    second.step(.02);
    expect(park.of(second.ctx).num("park.day")).toBe(3);
  });

  test("overlap is rejected and explicit new park archives the exact prior save", () => {
    const live = runner();
    live.ui.invoke("park.start");
    const raw = records.get(SAVE_KEY)!;
    const corrupt = JSON.parse(raw);
    const [first] = Object.values(corrupt.world.instances) as object[];
    corrupt.world.instances["duplicate-location"] = { ...first };
    expect(decodeSave(JSON.stringify(corrupt))).toBeNull();
    archiveSave();
    expect(records.has(SAVE_KEY)).toBe(false);
    expect([...records.entries()].find(([key]) => key.startsWith(`${SAVE_KEY}.backup.`))?.[1]).toBe(raw);
  });

  test("a save from before the world model opens a fresh park instead of crashing", () => {
    const old = { version: 3, stats: { cash: 9999, day: 4, ticketPrice: 20 }, placed: [], guests: [], staff: [], unlocks: [] };
    records.set(SAVE_KEY, JSON.stringify(old));
    const live = runner();
    const w = park.of(live.ctx);
    expect(w.num("park.day")).toBe(1);
    expect(w.instances().length).toBeGreaterThan(0);
    expect(session.saveStatus).toContain("older build");
    // The old document is kept until this park is saved, then archived as a backup.
    live.ui.invoke("park.start");
    expect([...records.keys()].some((key) => key.startsWith(`${SAVE_KEY}.backup.`))).toBe(true);
    expect(decodeSave(records.get(SAVE_KEY)!)).not.toBeNull();
  });

  test("a playable starter expansion climbs the rating; three debt settlements end play", () => {
    const live = runner();
    live.ui.invoke("park.start");
    live.ui.invoke("pickCarousel");
    live.ui.invoke("park.pointer", { point: [-40, 0, -40], object: null, entity: null });
    // A new ride opens once its entrance, queue, exit and paths join it to the park.
    live.ui.invoke("build.connect", { id: park.of(live.ctx).instances("ride_carousel").at(-1)!.id });
    live.ui.invoke("build.clear");
    live.ui.invoke("build.select", { id: "staff_janitor" });
    live.ui.invoke("park.pointer", { point: [-36, 0, -28], object: null, entity: null });
    // Advance a finite season through the actual loop, without forcing award stats.
    for (let frame = 0; frame < 450; frame++) live.step(1);
    const w = park.of(live.ctx);
    // The first award is a goal for real building, not for one carousel: the climb is what shows here.
    expect(w.num("park.peak")).toBeGreaterThan(180);
    expect(w.num("park.peak")).toBeLessThan(MILESTONES[0]!.rating);
    w.change({ "park.cash": -100_000 - w.num("park.cash") });
    for (let day = 0; day < 3; day++) closeDay(live.ctx);
    expect(w.fact("park.game_over")).toBe(true);
    expect(live.ctx.time.isPaused()).toBe(true);
    live.ui.invoke("pickCarousel");
    // The janitor was placed once, so placement ended; the refused pick did not start a new one.
    expect(session.selectedTool).toBeNull();
  // Several simulated days of a full park: about 4 s locally, more on a CI runner.
  }, 30_000);
});
