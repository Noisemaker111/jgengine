import { describe, expect, test } from "bun:test";
import { validateMissionCatalog } from "@jgengine/core/mission/mission";
import { missionMarkers } from "@jgengine/core/mission/triggers";
import { createWorldModel } from "@jgengine/core/worldModel/worldModel";
import { editorLayers } from "../editorLayers";
import { city, turfWar } from "./city";

const markers = missionMarkers(editorLayers);

describe("Mainsail's world model", () => {
  test("every job's mission is valid against the authored scene markers", () => {
    const missions = Object.values(city.jobs ?? {}).map((job) => job.mission);
    expect(validateMissionCatalog(missions, { markerIds: Object.keys(markers) }).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  test("the story opens with one thing to do and Marco on the phone", () => {
    const world = createWorldModel(city, { markers });
    expect(world.next()?.jobId).toBe("welcome");
    expect(world.contacts().map((contact) => contact.name)).toEqual(["Marco Vance"]);
  });

  test("clearing the docks hands Port Carmine over, changes what Marco says and introduces Dee", () => {
    const world = createWorldModel(city, { markers });
    world.set("jobs.welcome", "done");
    world.startJob("dock_sweep");
    world.signal("go");
    world.signal("clear");
    expect(world.fact("port.owner")).toBe("player");
    expect(world.says("marco")[0]).toContain("clean front");
    expect(world.contacts().map((contact) => contact.id)).toEqual(["marco", "dee"]);
    expect(world.says("dee")[0]).toContain("quiet");
    expect(world.job("clean_hands")?.status).toBe("available");
  });

  test("shooting a cop spreads: heat, a scared block, an angry HHPD and Dee cutting you off", () => {
    const heat: number[] = [];
    const world = createWorldModel(city, { markers, onOutput: (name, amount) => name === "heat" && heat.push(amount) });
    world.set("jobs.welcome", "done");
    world.set("jobs.dock_sweep", "done");
    expect(world.job("clean_hands")?.status).toBe("available");
    world.emit({ kind: "cop_down", place: "downtown", faction: "hhpd" });
    expect(heat).toEqual([110]);
    expect(world.num("downtown.fear")).toBe(35);
    expect(world.num("hhpd.mood")).toBe(-25);
    expect(world.says("dee")[0]).toBe("You shot a cop. Don't call me again.");
    expect(world.job("clean_hands")?.status).toBe("locked");
    expect(world.log().at(-1)?.text).toBe("Officer down in Downtown Vice.");
  });

  test("killing Carmine crew wears a block down until it flips, and a held block pays protection into the safe", () => {
    const live = { "clock.hour": 12, "clock.night": false, "police.stars": 0, "turf.held": 0 };
    const world = createWorldModel(city, { markers, live: () => live });
    expect(world.fact("marina.owner")).toBe("carmine");
    world.emit({ kind: "ganger_down", place: "marina", faction: "carmine" });
    world.emit({ kind: "ganger_down", place: "marina", faction: "carmine" });
    world.tick(0.3);
    expect(world.fact("marina.owner")).toBe("player");
    expect(world.log().map((entry) => entry.text)).toContain("You took the Marina from the Carmines.");
    live["turf.held"] = 1;
    world.tick(10);
    expect(world.num("fronts.takings")).toBeGreaterThanOrEqual(4.5);
  });

  test("once the Carmines are angry their pushes wear a held block down and they take it back", () => {
    const live = { "clock.hour": 12, "clock.night": false, "police.stars": 0, "turf.held": 0 };
    const pushes: string[] = [];
    const world = createWorldModel(city, { markers, live: () => live, hooks: { crewPush: (call) => pushes.push(call.place ?? "") } });
    world.emit({ kind: "ganger_down", place: "marina", faction: "carmine" });
    world.emit({ kind: "ganger_down", place: "marina", faction: "carmine" });
    world.tick(0.3);
    expect(world.fact("marina.owner")).toBe("player");
    world.set("carmine.mood", -60);
    const fired: string[] = [];
    for (let t = 0; t < 2000 && world.fact("marina.owner") === "player"; t += 1) fired.push(...(world.tick(1).fired ?? []));
    expect(world.fact("marina.owner")).toBe("carmine");
    expect(fired).toContain("turf:marina:player:carmine");
    expect(turfWar.handover("turf:marina:player:carmine")).toEqual({ block: "marina", from: "player", to: "carmine" });
    expect(pushes.length).toBeGreaterThan(0);
    expect(pushes.every((place) => place === "marina")).toBe(true);
    expect(world.log().map((entry) => entry.text)).toContain("The Carmines took the Marina from you.");
    expect(world.num("marina.grip")).toBe(40);
  });

  test("a bought front earns more at night, stops under heavy heat, and a raid that runs out its clock wrecks it", () => {
    const live = { "clock.hour": 12, "clock.night": false, "police.stars": 0, "turf.held": 0 };
    const raids: string[] = [];
    const world = createWorldModel(city, { markers, live: () => live, hooks: { raidStarted: (call) => raids.push(call.target ?? ""), raidLost: () => undefined } });
    const placed = world.place("lounge", { slot: "front_lounge" }, { free: true });
    expect(placed.ok).toBe(true);
    world.tick(10);
    const day = world.num("fronts.takings");
    expect(day).toBeCloseTo(30, 0);
    live["clock.night"] = true;
    world.tick(10);
    expect(world.num("fronts.takings") - day).toBeCloseTo(60, 0);
    live["police.stars"] = 3;
    const hot = world.num("fronts.takings");
    world.tick(10);
    expect(world.num("fronts.takings")).toBeCloseTo(hot, 3);
    const id = world.occupant("front_lounge")!;
    world.emit({ kind: "raid", target: id });
    expect(raids).toEqual([id]);
    expect(world.fact(`${id}.raid`)).toBe(true);
    world.emit({ kind: "raid_lost", target: id });
    expect(world.fact(`${id}.hit`)).toBe(true);
    expect(world.log().at(-1)?.text).toBe("The Carmines wrecked the Neon Lounge.");
  });
});
