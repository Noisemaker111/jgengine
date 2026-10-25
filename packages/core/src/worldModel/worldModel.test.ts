import { describe, expect, test } from "bun:test";
import type { MissionDef } from "../mission/mission";
import { calm, createWorldModel, defineWorldModel, type WorldModelState } from "./worldModel";

const dockSweep: MissionDef = {
  id: "dock_sweep",
  title: "Dock Sweep",
  start: "reach",
  objectives: [
    { id: "reach", kind: "reach", actor: "player", marker: "docks", radius: 10, next: "clear" },
    { id: "clear", kind: "kill", count: 2, match: { kind: "kill", target: "ganger" }, next: "done" },
  ],
  rewards: { economy: { cash: 900 } },
};

const ledger: MissionDef = {
  id: "ledger",
  title: "The Ledger",
  start: "reach",
  objectives: [{ id: "reach", kind: "reach", actor: "player", marker: "plaza", radius: 5, timeout: 10, onTimeout: "late", next: "done" }],
  fail: [{ id: "late", message: "Too slow." }],
};

const def = defineWorldModel({
  factions: { carmine: { label: "Carmine crew", facts: { mood: 0 } } },
  places: {
    port: { label: "Port Carmine", marker: "docks", radius: 50, owner: "carmine", facts: { fear: calm(0, 10) }, blip: { when: { "port.owner": "carmine" } } },
    plaza: { label: "Plaza", position: [200, 0], facts: { fear: calm(0, 10) } },
  },
  people: {
    marco: {
      name: "Marco Vance",
      at: "port",
      phone: true,
      facts: { trust: 0, fear: calm(0, 5) },
      says: [
        { text: "The Carmines took my docks.", when: { "port.owner": "carmine" } },
        { text: "The docks are ours now." },
      ],
    },
    sal: { name: "Sal", phone: true, known: false },
  },
  jobs: {
    dock_sweep: { title: "Dock Sweep", giver: "marco", act: 1, mission: dockSweep, beat: { "port.owner": "player", "marco.trust": 20, "carmine.mood": -30 } },
    ledger: { title: "The Ledger", giver: "marco", act: 2, requires: ["dock_sweep"], mission: ledger },
  },
  ripples: { gunfire: { place: { fear: 40 }, owner: { mood: -5 }, people: { fear: 30 }, out: { heat: 25 }, note: "Shots at {place}" } },
});

const markers = { docks: { x: 0, y: 0, z: 0 }, plaza: { x: 200, y: 0, z: 0 } };

describe("world model", () => {
  test("an event ripples into the place, its owner, the people there and the game's outputs", () => {
    const outputs: [string, number][] = [];
    const world = createWorldModel(def, { markers, onOutput: (name, amount) => outputs.push([name, amount]) });
    const entry = world.emit({ kind: "gunfire", at: [4, 0, 3], by: "player" });
    expect(entry?.text).toBe("Shots at Port Carmine");
    expect(world.num("port.fear")).toBe(40);
    expect(world.num("carmine.mood")).toBe(-5);
    expect(world.num("marco.fear")).toBe(30);
    expect(world.num("plaza.fear")).toBe(0);
    expect(outputs).toEqual([["heat", 25]]);
    expect(world.log().map((line) => line.text)).toEqual(["Shots at Port Carmine"]);
  });

  test("calming facts settle back toward rest and stay in bounds", () => {
    const world = createWorldModel(def, { markers });
    for (let i = 0; i < 5; i += 1) world.emit({ kind: "gunfire", place: "port" });
    expect(world.num("port.fear")).toBe(100);
    for (let i = 0; i < 32; i += 1) world.tick(0.125);
    expect(world.num("port.fear")).toBeCloseTo(60, 5);
  });

  test("a job is offered, runs on the mission machine fed by world facts, and its beat changes the world", () => {
    const paid: number[] = [];
    const world = createWorldModel(def, { markers, onReward: (rewards) => paid.push(rewards.economy?.cash ?? 0) });
    expect(world.job("ledger")?.status).toBe("locked");
    expect(world.next()).toEqual({ text: "See Marco Vance: Dock Sweep", jobId: "dock_sweep", target: [0, 0] });
    expect(world.blips().map((blip) => blip.id)).toEqual(["port", "dock_sweep"]);
    expect(world.startJob("dock_sweep")).toEqual({ kind: "job-started", jobId: "dock_sweep" });
    expect(world.next()?.target).toEqual([0, 0]);
    world.tick(0.1, { actors: { player: { position: { x: 1, y: 0, z: 1 } } } });
    expect(world.missionView()?.objectiveId).toBe("clear");
    const result = world.tick(0.1, { events: [{ kind: "kill", target: "ganger", count: 2 }] });
    expect(result.jobs).toEqual([{ kind: "job-done", jobId: "dock_sweep", beat: { "port.owner": "player", "marco.trust": 20, "carmine.mood": -30 } }]);
    expect(paid).toEqual([900]);
    expect(world.fact("port.owner")).toBe("player");
    expect(world.num("marco.trust")).toBe(20);
    expect(world.says("marco")).toEqual(["The docks are ours now."]);
    expect(world.job("ledger")?.status).toBe("available");
    expect(world.blips().map((blip) => blip.id)).toEqual(["ledger"]);
  });

  test("a failed job stays retryable from its giver", () => {
    const world = createWorldModel(def, { markers });
    world.startJob("dock_sweep");
    world.tick(0.1, { actors: { player: { position: { x: 0, y: 0, z: 0 } } } });
    world.tick(0.1, { events: [{ kind: "kill", target: "ganger", count: 2 }] });
    world.startJob("ledger");
    for (let i = 0; i < 120; i += 1) world.tick(0.1, { actors: { player: { position: { x: -500, y: 0, z: 0 } } } });
    expect(world.job("ledger")?.status).toBe("failed");
    expect(world.next()?.text).toBe("Retry Marco Vance: The Ledger");
    expect(world.startJob("ledger")?.kind).toBe("job-started");
  });

  test("the phone lists known contacts with their current line and open jobs", () => {
    const world = createWorldModel(def, { markers });
    expect(world.contacts().map((contact) => [contact.name, contact.line, contact.jobs.map((job) => job.id)])).toEqual([
      ["Marco Vance", "The Carmines took my docks.", ["dock_sweep"]],
    ]);
    world.set("sal.known", true);
    expect(world.contacts().map((contact) => contact.id)).toEqual(["marco", "sal"]);
  });

  test("state lives in the injected storage, so a reload or a host write puts the mission back", () => {
    let stored: WorldModelState | undefined;
    const storage = { read: () => stored, write: (next: WorldModelState) => { stored = next; } };
    const first = createWorldModel(def, { markers, storage });
    first.startJob("dock_sweep");
    first.tick(0.1, { actors: { player: { position: { x: 0, y: 0, z: 0 } } } });
    first.emit({ kind: "gunfire", place: "port" });
    const saved = structuredClone(stored!);
    const second = createWorldModel(def, { markers, storage: { read: () => saved, write: () => {} } });
    expect(second.missionView()?.objectiveId).toBe("clear");
    expect(second.num("port.fear")).toBe(40);
    const restored = createWorldModel(def, { markers });
    restored.restore(saved);
    expect(restored.job("dock_sweep")?.status).toBe("active");
  });

  test("a declaration that names unknown subjects fails at definition", () => {
    expect(() => defineWorldModel({ people: { ann: { name: "Ann", at: "nowhere" } } })).toThrow(/unknown place/);
    expect(() => defineWorldModel({ places: { a: {} }, people: { a: { name: "A" } } })).toThrow(/declared twice/);
    expect(() => defineWorldModel({ jobs: { j: { title: "J", giver: "ghost", mission: ledger } } })).toThrow(/not a person/);
  });
});

describe("world model outside a city", () => {
  test("a park: a breakdown scares the zone, guests sour, a repair job opens and its beat brings them back", () => {
    const repair: MissionDef = {
      id: "fix_coaster",
      title: "Fix the coaster",
      objectives: [
        { id: "go", kind: "reach", actor: "mechanic", marker: "coaster", radius: 4, next: "fix" },
        { id: "fix", kind: "survive", duration: 5 },
      ],
    };
    const park = defineWorldModel({
      factions: { guests: { label: "Guests", facts: { mood: calm(60, 0.1, { rest: 60 }) } } },
      places: { thrill_zone: { label: "Thrill Zone", marker: "coaster", radius: 40, owner: "guests", facts: { fear: calm(0, 2) } } },
      things: { coaster: { label: "Big Dipper", at: "thrill_zone", facts: { broken: false } } },
      people: { ivy: { name: "Ivy (maintenance)", at: "thrill_zone", phone: true, says: [{ text: "The Dipper's down again!", when: { "coaster.broken": true } }, { text: "All rides green." }] } },
      jobs: { fix: { title: "Fix the coaster", kind: "side", giver: "ivy", repeatable: true, when: { "coaster.broken": true }, mission: repair, beat: { "coaster.broken": false, "guests.mood": 20 } } },
      ripples: { breakdown: { place: { fear: 30 }, owner: { mood: -25 }, world: { "coaster.broken": true }, note: "{place} ride stopped." } },
    });
    const world = createWorldModel(park, { markers: { coaster: { x: 0, y: 0, z: 0 } } });
    expect(world.job("fix")?.status).toBe("locked");
    world.emit({ kind: "breakdown", place: "thrill_zone" });
    expect(world.num("guests.mood")).toBe(35);
    expect(world.says("ivy")[0]).toBe("The Dipper's down again!");
    expect(world.blips().map((blip) => blip.id)).toEqual(["fix"]);
    world.startJob("fix");
    world.tick(0.1, { actors: { mechanic: { position: { x: 1, y: 0, z: 0 } } } });
    for (let i = 0; i < 60; i += 1) world.tick(0.1);
    expect(world.fact("coaster.broken")).toBe(false);
    expect(world.says("ivy")[0]).toBe("All rides green.");
    expect(world.num("guests.mood")).toBeGreaterThan(50);
  });
});
