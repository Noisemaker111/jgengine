import { describe, expect, test } from "bun:test";
import { validateMissionCatalog } from "@jgengine/core/mission/mission";
import { missionMarkers } from "@jgengine/core/mission/triggers";
import { createWorldModel } from "@jgengine/core/worldModel/worldModel";
import { editorLayers } from "../editorLayers";
import { city, SET_PIECES } from "./city";

const markers = missionMarkers(editorLayers);

/** Every pizza fact at zero, the way a new career reports them. */
const zero = {
  "pizza.delivered": 0, "pizza.happy": 0, "pizza.rep": 0, "pizza.swaps": 0, "pizza.hull_drops": 0, "pizza.stack_drops": 0,
  "pizza.shaken": 0, "pizza.upstairs_drops": 0, "pizza.paid": 0, "pizza.saved": 0, "pizza.night_score": 0, "pizza.night_failed": false,
};

describe("Mainsail's story: saving Vell's", () => {
  test("every chapter's mission is valid against the authored scene markers", () => {
    const missions = Object.values(city.jobs ?? {}).map((job) => job.mission);
    expect(validateMissionCatalog(missions, { markerIds: Object.keys(markers) }).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  test("the story opens on the first night with Nonna on the phone and no gangs anywhere", () => {
    const world = createWorldModel(city, { markers });
    expect(world.next()?.jobId).toBe("welcome");
    expect(world.contacts().map((contact) => contact.name)).toEqual(["Nonna Rosa Vell"]);
    expect(Object.keys(city.factions ?? {})).toEqual(["carmine", "riptide", "megaslice", "hhpd", "locals"]);
    expect(Object.values(city.jobs ?? {}).flatMap((job) => job.mission.objectives).some((objective) => objective.kind === "kill")).toBe(false);
  });

  test("three boxes finish the first night, introduce Rita and Dee, and open Reading the Water", () => {
    const world = createWorldModel(city, { markers });
    world.startJob("welcome");
    expect(world.tick(0.1, { facts: { ...zero, "pizza.delivered": 2 } }).jobs).toEqual([]);
    const done = world.tick(0.1, { facts: { ...zero, "pizza.delivered": 3 } });
    expect(done.jobs.map((event) => event.kind)).toEqual(["job-done"]);
    expect(world.contacts().map((contact) => contact.id)).toEqual(["nonna", "rita", "dee"]);
    expect(world.job("learn_water")?.status).toBe("available");
    expect(world.says("nonna")[0]).toContain("swap docks");
  });

  test("the chapters chain to the end on the shift's own facts", () => {
    const world = createWorldModel(city, { markers });
    const facts = { ...zero };
    const play = (jobId: string, patch: Partial<typeof zero>) => {
      expect(world.job(jobId)?.status).toBe("available");
      world.startJob(jobId);
      Object.assign(facts, patch);
      for (let i = 0; i < 4 && world.job(jobId)?.status === "active"; i += 1) world.tick(0.1, { facts });
      expect(world.job(jobId)?.status).toBe("done");
    };
    play("welcome", { "pizza.delivered": 3 });
    play("learn_water", { "pizza.swaps": 1, "pizza.hull_drops": 1 });
    play("crust_war", { "pizza.stack_drops": 2, "pizza.shaken": 1 });
    expect(world.contacts().map((contact) => contact.id)).toContain("tony");
    play("festival_night", { "pizza.night_score": 6 });
    facts["pizza.night_score"] = 0;
    play("riptide_run", { "pizza.upstairs_drops": 4 });
    play("storm_surge", { "pizza.night_score": 5 });
    facts["pizza.night_score"] = 0;
    expect(world.contacts().map((contact) => contact.id)).toContain("victor");
    play("megaslice_man", { "pizza.paid": 3000 });
    play("blackout", { "pizza.night_score": 5 });
    play("save_vells", { "pizza.saved": 1 });
    expect(world.fact("story.act")).toBe(5);
    expect(world.says("nonna")[0]).toContain("Vell's is ours");
  });

  test("midnight before the score rains a set-piece night out, and its giver offers it again", () => {
    const world = createWorldModel(city, { markers });
    for (const id of ["welcome", "learn_water", "crust_war"]) world.set(`jobs.${id}`, "done");
    world.startJob("festival_night");
    world.tick(0.1, { facts: { ...zero, "pizza.night_score": 3 } });
    const rained = world.tick(0.1, { facts: { ...zero, "pizza.night_score": 3, "pizza.night_failed": true } });
    expect(rained.jobs.map((event) => event.kind)).toEqual(["job-failed"]);
    expect(world.job("festival_night")?.status).toBe("failed");
    expect(Object.keys(SET_PIECES)).toEqual(["festival_night", "storm_surge", "blackout"]);
  });

  test("knocking a warden down spreads: heat, a scared block, an angry Warden post and Dee cutting you off", () => {
    const heat: number[] = [];
    const world = createWorldModel(city, { markers, onOutput: (name, amount) => name === "heat" && heat.push(amount) });
    world.set("dee.known", true);
    world.emit({ kind: "cop_down", place: "downtown", faction: "hhpd" });
    expect(heat).toEqual([110]);
    expect(world.num("downtown.fear")).toBe(35);
    expect(world.num("hhpd.mood")).toBe(-25);
    expect(world.says("dee")[0]).toBe("You hurt one of my wardens. Don't call me again.");
    expect(world.log().at(-1)?.text).toBe("A warden went down in Downtown Vice.");
  });
});
