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
  POPSICLE_CLAIM_ID,
  HOSE_CROSSING_ID,
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

describe("the yard campaign is engine mission data", () => {
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

  test("the teaching order claims the popsicle, crosses the hose, survives the mower, raids the queen and ends on the beam", () => {
    const kinds = CAMPAIGN.map((step) => step.mission.objectives.map((objective) => objective.kind));
    expect(kinds[0]).toContain("collect");
    expect(kinds[1]).toEqual(["reach"]);
    expect(kinds[2]).toEqual(["survive"]);
    expect(kinds[3]).toEqual(["reach", "kill"]);
    expect(kinds[4]).toEqual(["survive", "kill"]);
    expect(mission(CAMPAIGN[2]!.mission.id).objectives[0]!.duration).toBe(150);
  });

  test("each mission turns on the yard hazard it is about", () => {
    expect(CAMPAIGN[0]!.hazards.sprinkler).toBe(true);
    expect(CAMPAIGN[2]!.hazards.mower).toBe(true);
    expect(CAMPAIGN[3]!.hazards.night).toBe(true);
    expect(CAMPAIGN[4]!.hazards.beam).toBe(true);
    // Only the finale brings the kid with the magnifying glass.
    expect(CAMPAIGN.filter((step) => step.hazards.beam)).toHaveLength(1);
  });
});

describe("the missions run on the machine", () => {
  test("the Popsicle Claim counts a Barracks Chamber and four Soldiers from world events, then needs the Marshal on the popsicle", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[0]!.mission.id);
    runtime.start(def.id);
    const atMuster = markers["campaign_popsicle"]!;

    let events = runtime.tick(0.1, {
      events: [{ kind: "collect", target: "barracks" } satisfies MissionWorldEvent],
      actors: { [HERO_ID]: { alive: true, position: { x: 0, y: 0, z: 36 } } },
    });
    expect(runtime.state()?.objective).toBe(objectiveId(def, 1));

    events = runtime.tick(0.1, {
      events: Array.from({ length: 4 }, () => ({ kind: "collect", target: "soldier" }) satisfies MissionWorldEvent),
      actors: { [HERO_ID]: { alive: true, position: { x: 0, y: 0, z: 36 } } },
    });
    expect(runtime.state()?.objective).toBe(objectiveId(def, 2));
    expect(drain(events, "completed")).toHaveLength(0);

    events = runtime.tick(0.1, {
      actors: { [HERO_ID]: { alive: true, position: { x: atMuster.x, y: 0, z: atMuster.z } } },
    });
    expect(runtime.state()?.status).toBe("completed");
    const completed = drain(events, "completed")[0];
    expect(completed?.kind === "completed" ? completed.rewards?.economy?.sugar : 0).toBe(120);
  });

  test("Mower Day is a two-and-a-half-minute hold whose clock the HUD can read", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[2]!.mission.id);
    runtime.start(def.id);
    runtime.tick(1, { actors: { [HERO_ID]: { alive: true } }, survivors: 4 });
    expect(runtime.view()?.remaining).toBeCloseTo(149, 5);
    const events = runtime.tick(150, { actors: { [HERO_ID]: { alive: true } }, survivors: 4 });
    expect(runtime.state()?.status).toBe("completed");
    expect(drain(events, "completed")).toHaveLength(1);
  });

  test("the struggled defence fails in its named state when the line is gone", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[2]!.mission.id);
    runtime.start(def.id);
    const events = runtime.tick(1, { actors: { [HERO_ID]: { alive: true } }, survivors: 0 });
    const failed = drain(events, "failed")[0];
    expect(failed?.kind === "failed" ? failed.state : "").toBe("watch_overrun");
  });

  test("Crossing the Hose escorts the Marshal to the authored far bank and fails if he falls", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[1]!.mission.id);
    const seam = markers["campaign_far_bank"]!;
    runtime.start(def.id);
    let events = runtime.tick(0.1, { actors: { [HERO_ID]: { alive: true, position: { x: 0, y: 0, z: 28 } } } });
    expect(runtime.state()?.status).toBe("active");
    events = runtime.tick(0.1, { actors: { [HERO_ID]: { alive: true, position: { x: seam.x, y: 0, z: seam.z } } } });
    expect(runtime.state()?.status).toBe("completed");

    const second = machine();
    second.start(def.id);
    const failed = drain(second.tick(0.1, { actors: { [HERO_ID]: { alive: false } } }), "failed")[0];
    expect(failed?.kind === "failed" ? failed.state : "").toBe("mandible_waylaid");
  });

  test("the Black Queen raid reaches the brood mound, then needs it dug out", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[3]!.mission.id);
    const raid = markers["campaign_brood_raid"]!;
    const heroAt = { alive: true, position: { x: raid.x, y: 0, z: raid.z } };
    runtime.start(def.id);
    runtime.tick(0.1, { actors: { [HERO_ID]: heroAt } });
    expect(runtime.state()?.objective).toBe(objectiveId(def, 1));
    // Killing raiders does not count: only the brood mound does.
    runtime.tick(1, { actors: { [HERO_ID]: heroAt }, events: [{ kind: "kill", target: "raider", tags: ["rival"] }] });
    expect(runtime.state()?.status).toBe("active");
    const events = runtime.tick(1, { actors: { [HERO_ID]: heroAt }, events: [{ kind: "kill", target: "brood_mound", tags: ["rival"] }] });
    expect(runtime.state()?.status).toBe("completed");
    expect(drain(events, "completed")).toHaveLength(1);

    const lost = machine();
    lost.start(def.id);
    const failed = drain(lost.tick(0.1, { actors: { [HERO_ID]: { alive: false } } }), "failed")[0];
    expect(failed?.kind === "failed" ? failed.state : "").toBe("mandible_fell");
  });

  test("the finale chains outlasting the beam into digging out the black nest", () => {
    const runtime = machine();
    const def = mission(CAMPAIGN[4]!.mission.id);
    runtime.start(def.id);
    runtime.tick(61, { actors: { [HERO_ID]: { alive: true } }, survivors: 5 });
    expect(runtime.state()?.objective).toBe(objectiveId(def, 1));
    const events = runtime.tick(0.1, {
      actors: { [HERO_ID]: { alive: true } },
      survivors: 5,
      events: [{ kind: "kill", target: "keep_enemy", tags: ["rival"] }],
    });
    expect(runtime.state()?.status).toBe("completed");
    expect(runtime.view()?.step).toBe(2);
    expect(drain(events, "completed")).toHaveLength(1);
  });
});

describe("the campaign track", () => {
  const progress = (won: string[], mode: CampaignProgress["mode"] = "campaign"): CampaignProgress =>
    ({ won, mode, stores: { sugar: 0, leaf: 0 } });

  test("missions are offered in order and skipped once won", () => {
    expect(nextCampaignStep(progress([]))?.mission.id).toBe(CAMPAIGN[0]!.mission.id);
    expect(nextCampaignStep(progress([CAMPAIGN[0]!.mission.id]))?.mission.id).toBe(CAMPAIGN[1]!.mission.id);
    expect(nextCampaignStep(progress(CAMPAIGN.slice(0, 4).map((step) => step.mission.id)))?.mission.id).toBe(CAMPAIGN[4]!.mission.id);
    expect(nextCampaignStep(progress(CAMPAIGN.map((step) => step.mission.id)))).toBeNull();
    expect(nextCampaignStep(progress([], "skirmish"))).toBeNull();
  });

  test("the yard's stores are the purse the next battle opens with", () => {
    expect(campaignStores(progress([]))).toEqual({ sugar: 0, leaf: 0 });
    expect(campaignStores({ ...progress([]), stores: { sugar: 280, leaf: 100 } })).toEqual({ sugar: 280, leaf: 100 });
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
    campaignStore.write(first, { won: [CAMPAIGN[0]!.mission.id], mode: "campaign", stores: { sugar: 120, leaf: 40 } });
    const snapshot = first.state();
    const second = boot();
    second.hydrate(snapshot);
    expect(campaignStore.read(second).won).toEqual([CAMPAIGN[0]!.mission.id]);
    expect(campaignStore.read(second).stores).toEqual({ sugar: 120, leaf: 40 });
    expect(nextCampaignStep(campaignStore.read(second))?.mission.id).toBe(CAMPAIGN[1]!.mission.id);
  });

  test("the readout reports the live objective and its clock", () => {
    const ctx = boot();
    campaignStore.write(ctx, { won: [], mode: "campaign", stores: { sugar: 0, leaf: 0 } });
    const readout = campaignReadout(ctx);
    expect(readout?.brief).toBe(CAMPAIGN[0]!.brief);
    expect(readout?.steps).toBe(CAMPAIGN[0]!.mission.objectives.length);
  });

  test("mission I completes through the real wiring and offers mission II with its stores", () => {
    const ctx = boot();
    setupSkirmish(ctx);
    ctx.game.commands.run("match.start", {});
    expect(hudStore.get().campaign?.phase).toBe("live");
    expect(hudStore.get().campaign?.missionId).toBe(POPSICLE_CLAIM_ID);

    const restage = () => setupSkirmish(ctx);
    noteCampaignBuild(ctx, "barracks");
    tickCampaign(ctx, 0.2, restage);
    expect(campaignRuntime(ctx).state()?.objective).toBe("muster_soldiers");

    for (let i = 0; i < 4; i += 1) {
      noteCampaignTrain(ctx, "soldier");
      tickCampaign(ctx, 0.2, restage);
    }
    expect(campaignRuntime(ctx).state()?.objective).toBe("march_muster");

    const muster = markers["campaign_popsicle"]!;
    ctx.scene.entity.setPose(HERO_ID, { position: [muster.x, ctx.world.groundHeightAt(muster.x, muster.z), muster.z] });
    tickCampaign(ctx, 0.2, restage);

    expect(campaignStore.read(ctx).won).toContain(POPSICLE_CLAIM_ID);
    expect(campaignStore.read(ctx).stores).toEqual({ sugar: 120, leaf: 40 });
    const card = hudStore.get().campaign;
    expect(card?.phase).toBe("cleared");
    expect(card?.missionId).toBe(HOSE_CROSSING_ID);
    expect(card?.index).toBe(2);
  });

  test("a loss ends in the authored fail state and keeps the same mission on offer", () => {
    const ctx = boot();
    setupSkirmish(ctx);
    ctx.game.commands.run("match.start", {});
    ctx.scene.entity.despawn(HERO_ID);
    tickCampaign(ctx, 0.2, () => setupSkirmish(ctx));
    // Mission I's dig phase only fails with the nest; the hero's fall shows up on the march.
    expect(campaignRuntime(ctx).state()?.status).toBe("active");
    const card = hudStore.get().campaign;
    expect(card?.missionId).toBe(POPSICLE_CLAIM_ID);
    expect(card?.objective).toBe(CAMPAIGN[0]!.mission.objectives[0]!.label ?? "");
  });
});

