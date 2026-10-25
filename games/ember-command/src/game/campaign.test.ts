import { beforeEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import {
  createMissionRuntime,
  validateMissionCatalog,
  type MissionDef,
  type MissionEvent,
  type MissionWorldEvent,
} from "@jgengine/core/mission/mission";
import { missionMarkers } from "@jgengine/core/mission/triggers";

import { editorLayers } from "../editorLayers";
import {
  CAMPAIGN,
  CAMPAIGN_MISSIONS,
  FIRST_MUSTER_ID,
  LONG_WATCH_ID,
  campaignMarkerIds,
  campaignReadout,
  campaignRuntime,
  campaignStores,
  campaignStore,
  nextCampaignStep,
  noteCampaignBuild,
  noteCampaignTrain,
  syncCampaignHud,
  tickCampaign,
  type CampaignProgress,
} from "./campaign";
import { content } from "./content";
import { hudStore } from "./hudStore";
import { HERO_ID } from "./hero";
import { resetSession } from "./session";
import { setupSkirmish } from "./world/scene";

const markers = missionMarkers(editorLayers);
const markerIds = editorLayers.markers.map((marker) => marker.id);

/** A bare mission machine over the campaign catalog, using the authored marker positions. */
function machine(): ReturnType<typeof createMissionRuntime> {
  return createMissionRuntime({ missions: CAMPAIGN_MISSIONS, markers });
}

function mission(id: string): MissionDef {
  const def = CAMPAIGN_MISSIONS.find((entry) => entry.id === id);
  if (def === undefined) throw new Error(`no campaign mission "${id}"`);
  return def;
}

function objectiveId(def: MissionDef, index: number): string {
  const objective = def.objectives[index];
  if (objective === undefined) throw new Error(`${def.id} has no objective ${index}`);
  return objective.id;
}

/** Tick until an objective is entered or the mission ends, so a test reads events by name. */
function drain(events: readonly MissionEvent[], kind: MissionEvent["kind"]): MissionEvent[] {
  return events.filter((event) => event.kind === kind);
}

describe("the vale campaign is engine mission data", () => {
  test("the authored catalog lints clean against the scene's markers", () => {
    const issues = validateMissionCatalog(CAMPAIGN_MISSIONS, { markerIds });
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  test("five missions, each with a named fail state, a reward and a field-desk brief", () => {
    expect(CAMPAIGN).toHaveLength(5);
    for (const step of CAMPAIGN) {
      expect(step.brief.length).toBeGreaterThan(20);
      expect(step.mission.fail?.length ?? 0).toBeGreaterThan(0);
      expect(Object.keys(step.mission.rewards?.economy ?? {}).length).toBeGreaterThan(0);
      expect(step.mission.title.length).toBeGreaterThan(3);
    }
  });

  test("every marker an objective or fail condition reads is authored in the scene", () => {
    for (const id of campaignMarkerIds()) expect(markerIds).toContain(id);
  });

  test("each mission walks its own objectives in order and ends at done", () => {
    for (const def of CAMPAIGN_MISSIONS) {
      const ids = def.objectives.map((objective) => objective.id);
      for (const [index, objective] of def.objectives.entries()) {
        const next = objective.next ?? "done";
        if (next === "done") expect(index).toBe(def.objectives.length - 1);
        else expect(ids).toContain(next);
      }
    }
  });

  test("the teaching order starts with a build order, holds with a timer, escorts, guards a loss and chains a finale", () => {
    const kinds = CAMPAIGN.map((step) => step.mission.objectives.map((objective) => objective.kind));
    expect(kinds[0]).toContain("collect");
    expect(kinds[1]).toEqual(["survive"]);
    expect(kinds[2]).toEqual(["reach"]);
    expect(kinds[3]).toEqual(["reach", "survive"]);
    expect(kinds[4]).toHaveLength(2);
    expect(mission(CAMPAIGN[1]!.mission.id).objectives[0]!.duration).toBe(120);
  });
});

describe("the missions run on the machine", () => {
  test("First Muster counts a Barracks and four Footmen from world events, then needs Bram at the muster ground", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[0]!.mission.id);
    runtime.start(def.id);
    const atMuster = markers["campaign_muster"]!;

    let events = runtime.tick(0.1, {
      events: [{ kind: "collect", target: "barracks" } satisfies MissionWorldEvent],
      actors: { [HERO_ID]: { alive: true, position: { x: 0, y: 0, z: 36 } } },
    });
    expect(runtime.state()?.objective).toBe(objectiveId(def, 1));

    events = runtime.tick(0.1, {
      events: Array.from({ length: 4 }, () => ({ kind: "collect", target: "footman" }) satisfies MissionWorldEvent),
      actors: { [HERO_ID]: { alive: true, position: { x: 0, y: 0, z: 36 } } },
    });
    expect(runtime.state()?.objective).toBe(objectiveId(def, 2));
    expect(drain(events, "completed")).toHaveLength(0);

    events = runtime.tick(0.1, {
      actors: { [HERO_ID]: { alive: true, position: { x: atMuster.x, y: 0, z: atMuster.z } } },
    });
    expect(runtime.state()?.status).toBe("completed");
    const completed = drain(events, "completed")[0];
    expect(completed?.kind === "completed" ? completed.rewards?.economy?.gold : 0).toBe(120);
  });

  test("the Long Watch is a two-minute hold whose clock the HUD can read", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[1]!.mission.id);
    runtime.start(def.id);
    runtime.tick(1, { actors: { [HERO_ID]: { alive: true } }, survivors: 4 });
    expect(runtime.view()?.remaining).toBeCloseTo(119, 5);
    const events = runtime.tick(120, { actors: { [HERO_ID]: { alive: true } }, survivors: 4 });
    expect(runtime.state()?.status).toBe("completed");
    expect(drain(events, "completed")).toHaveLength(1);
  });

  test("the struggled defence fails in its named state when the line is gone", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[1]!.mission.id);
    runtime.start(def.id);
    const events = runtime.tick(1, { actors: { [HERO_ID]: { alive: true } }, survivors: 0 });
    const failed = drain(events, "failed")[0];
    expect(failed?.kind === "failed" ? failed.state : "").toBe("watch_overrun");
  });

  test("Road to Mid Vale escorts Bram to the authored seam and fails if he falls", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[2]!.mission.id);
    const seam = markers["goldmine_mid"]!;
    runtime.start(def.id);
    let events = runtime.tick(0.1, { actors: { [HERO_ID]: { alive: true, position: { x: 0, y: 0, z: 28 } } } });
    expect(runtime.state()?.status).toBe("active");
    events = runtime.tick(0.1, { actors: { [HERO_ID]: { alive: true, position: { x: seam.x, y: 0, z: seam.z } } } });
    expect(runtime.state()?.status).toBe("completed");

    const second = machine();
    second.start(def.id);
    const failed = drain(second.tick(0.1, { actors: { [HERO_ID]: { alive: false } } }), "failed")[0];
    expect(failed?.kind === "failed" ? failed.state : "").toBe("bram_waylaid");
  });

  test("the Thin Line breaks when a Vanguard soldier falls, and completes when none does", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[3]!.mission.id);
    const crossroads = markers["campaign_crossroads"]!;
    const heroAt = { alive: true, position: { x: crossroads.x, y: 0, z: crossroads.z } };
    runtime.start(def.id);
    runtime.tick(0.1, { actors: { [HERO_ID]: heroAt } });
    expect(runtime.state()?.objective).toBe(objectiveId(def, 1));

    const failed = drain(runtime.tick(1, {
      actors: { [HERO_ID]: heroAt },
      survivors: 3,
      events: [{ kind: "kill", target: "footman", tags: ["vanguard"] }],
    }), "failed")[0];
    expect(failed?.kind === "failed" ? failed.state : "").toBe("line_broken");

    const clean = machine();
    clean.start(def.id);
    clean.tick(0.1, { actors: { [HERO_ID]: heroAt } });
    const events = clean.tick(46, { actors: { [HERO_ID]: heroAt }, survivors: 4, events: [{ kind: "kill", target: "grunt", tags: ["marauder"] }] });
    expect(clean.state()?.status).toBe("completed");
    expect(drain(events, "completed")).toHaveLength(1);
  });

  test("the finale chains weather-the-push into razing the Warcamp", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[4]!.mission.id);
    runtime.start(def.id);
    runtime.tick(61, { actors: { [HERO_ID]: { alive: true } }, survivors: 5 });
    expect(runtime.state()?.objective).toBe(objectiveId(def, 1));
    const events = runtime.tick(0.1, {
      actors: { [HERO_ID]: { alive: true } },
      survivors: 5,
      events: [{ kind: "kill", target: "keep_enemy", tags: ["marauder"] }],
    });
    expect(runtime.state()?.status).toBe("completed");
    expect(runtime.view()?.step).toBe(2);
    expect(drain(events, "completed")).toHaveLength(1);
  });
});

describe("the campaign track", () => {
  const progress = (won: string[], mode: CampaignProgress["mode"] = "campaign"): CampaignProgress =>
    ({ won, mode, stores: { gold: 0, lumber: 0 } });

  test("missions are offered in order and skipped once won", () => {
    expect(nextCampaignStep(progress([]))?.mission.id).toBe(CAMPAIGN[0]!.mission.id);
    expect(nextCampaignStep(progress([CAMPAIGN[0]!.mission.id]))?.mission.id).toBe(CAMPAIGN[1]!.mission.id);
    expect(nextCampaignStep(progress(CAMPAIGN.slice(0, 4).map((step) => step.mission.id)))?.mission.id).toBe(CAMPAIGN[4]!.mission.id);
    expect(nextCampaignStep(progress(CAMPAIGN.map((step) => step.mission.id)))).toBeNull();
    expect(nextCampaignStep(progress([], "skirmish"))).toBeNull();
  });

  test("the vale's stores are the purse the next battle opens with", () => {
    expect(campaignStores(progress([]))).toEqual({ gold: 0, lumber: 0 });
    expect(campaignStores({ ...progress([]), stores: { gold: 280, lumber: 100 } })).toEqual({ gold: 280, lumber: 100 });
  });
});

describe("the field desk reads the machine", () => {
  beforeEach(() => resetSession());

  function boot(): GameContext {
    const definition = defineGameDefinition({ name: "EmberCommandCampaignTest", multiplayer: "off" });
    return createGameContext({ definition, content, player: { userId: "commander", isNew: true } });
  }

  test("a fresh campaign offers mission I and mirrors it into the HUD", () => {
    const ctx = boot();
    syncCampaignHud(ctx);
    const card = hudStore.get().campaign;
    expect(card?.phase).toBe("ready");
    expect(card?.title).toBe(CAMPAIGN[0]!.mission.title);
    expect(card?.index).toBe(1);
    expect(card?.total).toBe(5);
    expect(card?.objective).toBe(CAMPAIGN[0]!.mission.objectives[0]!.label ?? "");
    expect(card?.remaining).toBeNull();
  });

  test("campaign progress is written into the world snapshot, so a save carries it", () => {
    const first = boot();
    campaignStore.write(first, { won: [CAMPAIGN[0]!.mission.id], mode: "campaign", stores: { gold: 120, lumber: 40 } });
    const snapshot = first.state();
    const second = boot();
    second.hydrate(snapshot);
    expect(campaignStore.read(second).won).toEqual([CAMPAIGN[0]!.mission.id]);
    expect(campaignStore.read(second).stores).toEqual({ gold: 120, lumber: 40 });
    expect(nextCampaignStep(campaignStore.read(second))?.mission.id).toBe(CAMPAIGN[1]!.mission.id);
  });

  test("the readout reports the live objective and its clock", () => {
    const ctx = boot();
    campaignStore.write(ctx, { won: [], mode: "campaign", stores: { gold: 0, lumber: 0 } });
    const readout = campaignReadout(ctx);
    expect(readout?.brief).toBe(CAMPAIGN[0]!.brief);
    expect(readout?.steps).toBe(CAMPAIGN[0]!.mission.objectives.length);
  });

  test("mission I completes through the real wiring and offers mission II with its stores", () => {
    const ctx = boot();
    setupSkirmish(ctx);
    ctx.game.commands.run("match.start", {});
    expect(hudStore.get().campaign?.phase).toBe("live");
    expect(hudStore.get().campaign?.missionId).toBe(FIRST_MUSTER_ID);

    const restage = () => setupSkirmish(ctx);
    noteCampaignBuild(ctx, "barracks");
    tickCampaign(ctx, 0.2, restage);
    expect(campaignRuntime(ctx).state()?.objective).toBe("muster_footmen");

    for (let i = 0; i < 4; i += 1) {
      noteCampaignTrain(ctx, "footman");
      tickCampaign(ctx, 0.2, restage);
    }
    expect(campaignRuntime(ctx).state()?.objective).toBe("march_muster");

    const muster = markers["campaign_muster"]!;
    ctx.scene.entity.setPose(HERO_ID, { position: [muster.x, ctx.world.groundHeightAt(muster.x, muster.z), muster.z] });
    tickCampaign(ctx, 0.2, restage);

    expect(campaignStore.read(ctx).won).toContain(FIRST_MUSTER_ID);
    expect(campaignStore.read(ctx).stores).toEqual({ gold: 120, lumber: 40 });
    const card = hudStore.get().campaign;
    expect(card?.phase).toBe("cleared");
    expect(card?.missionId).toBe(LONG_WATCH_ID);
    expect(card?.index).toBe(2);
  });

  test("a loss ends in the authored fail state and keeps the same mission on offer", () => {
    const ctx = boot();
    setupSkirmish(ctx);
    ctx.game.commands.run("match.start", {});
    ctx.scene.entity.despawn(HERO_ID);
    tickCampaign(ctx, 0.2, () => setupSkirmish(ctx));
    // Mission I's build phase only fails with the keep; the hero's fall shows up on the march.
    expect(campaignRuntime(ctx).state()?.status).toBe("active");
    const card = hudStore.get().campaign;
    expect(card?.missionId).toBe(FIRST_MUSTER_ID);
    expect(card?.objective).toBe(CAMPAIGN[0]!.mission.objectives[0]!.label ?? "");
  });
});

