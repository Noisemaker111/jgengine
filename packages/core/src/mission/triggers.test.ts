import { describe, expect, test } from "bun:test";

import type { SceneDocumentLike } from "../world/sceneShapes";
import { createMissionRuntime, type MissionDef } from "./mission";
import {
  MISSION_TRIGGER_ACTIONS,
  createMissionTriggerBridge,
  missionMarkers,
  registerMissionTriggerActions,
} from "./triggers";

registerMissionTriggerActions();

const SIMPLE: MissionDef = {
  id: "simple",
  title: "Simple",
  objectives: [{ id: "goal", kind: "reach", actor: "player", marker: "far", next: "done" }],
};

const ORIGIN = { x: 0, y: 0, z: 0 };

function doc(markers: SceneDocumentLike["markers"]): SceneDocumentLike {
  return { markers, volumes: [], paths: [] };
}

describe("authored mission markers", () => {
  test("marker positions are read off the document by id", () => {
    const document = doc([
      { id: "far", kind: "poi", position: { x: 100, y: 0, z: 0 } },
      { id: "start", kind: "poi", position: ORIGIN },
    ]);
    expect(missionMarkers(document)).toEqual({
      far: { x: 100, y: 0, z: 0 },
      start: ORIGIN,
    });
  });

  test("the mission actions are registered so the editor can assign them", () => {
    expect(MISSION_TRIGGER_ACTIONS.map((action) => action.id)).toEqual([
      "mission_start",
      "mission_objective",
      "mission_fail",
    ]);
  });

  test("entering a mission_start marker starts the mission, once per entry", () => {
    const document = doc([
      { id: "start", kind: "poi", position: ORIGIN, meta: { on: "enter", action: "mission_start", mission: "simple" } },
      { id: "far", kind: "poi", position: { x: 100, y: 0, z: 0 } },
    ]);
    const run = createMissionRuntime({ missions: [SIMPLE], markers: missionMarkers(document) });
    const bridge = createMissionTriggerBridge({ runtime: run, document });
    bridge.step({ actors: [{ id: "player", position: ORIGIN }] });
    expect(run.state()!.missionId).toBe("simple");
    bridge.step({ actors: [{ id: "player", position: ORIGIN }] });
    expect(run.stats().started).toBe(1);
  });

  test("entering a mission_objective marker completes the objective", () => {
    const document = doc([
      { id: "trigger", kind: "poi", position: ORIGIN,
        meta: { on: "enter", action: "mission_objective", mission: "simple", objective: "goal" } },
      { id: "far", kind: "poi", position: { x: 100, y: 0, z: 0 } },
    ]);
    const run = createMissionRuntime({ missions: [SIMPLE], markers: missionMarkers(document) });
    run.start("simple");
    const bridge = createMissionTriggerBridge({ runtime: run, document });
    bridge.step({ actors: [{ id: "player", position: ORIGIN }] });
    expect(run.state()!.status).toBe("completed");
  });

  test("entering a mission_fail marker lands the named fail state", () => {
    const mission: MissionDef = {
      id: "simple",
      title: "Simple",
      objectives: [{ id: "goal", kind: "reach", actor: "player", marker: "far", next: "done" }],
      fail: [{ id: "aborted" }],
    };
    const document = doc([
      { id: "abort", kind: "poi", position: ORIGIN,
        meta: { on: "enter", action: "mission_fail", mission: "simple", state: "aborted" } },
      { id: "far", kind: "poi", position: { x: 100, y: 0, z: 0 } },
    ]);
    const run = createMissionRuntime({ missions: [mission], markers: missionMarkers(document) });
    run.start("simple");
    const bridge = createMissionTriggerBridge({ runtime: run, document });
    bridge.step({ actors: [{ id: "player", position: ORIGIN }] });
    expect(run.state()!.status).toBe("failed");
    expect(run.state()!.outcome).toBe("aborted");
  });
});
