import { afterEach, describe, expect, test } from "bun:test";

import { createEmptyEditorDocument, decodeEditorDocument, exportEditorDocumentJson } from "../editor/document";
import type { EditorMarker } from "../editor/types";
import { validateParams } from "../generator/paramSchema";
import { clearTriggerActions, collectAuthoredTriggers, getTriggerAction } from "../scene/authoredTriggers";
import { getSceneKind, placeMetaFor } from "../scene/sceneKinds";
import { createMissionRuntime, type MissionDef } from "./mission";
import {
  MISSION_MARKER_KIND,
  createMissionTriggerBridge,
  missionMarkerSchema,
  missionMarkers,
  registerMissionMarkerKind,
  validateMissionMarkers,
} from "./triggers";

const ESCORT: MissionDef = {
  id: "escort",
  title: "Escort",
  objectives: [
    { id: "meet", kind: "reach", actor: "player", marker: "far", next: "drop" },
    { id: "drop", kind: "reach", actor: "player", marker: "far", next: "done" },
  ],
  fail: [{ id: "ambushed" }],
};
const HEIST: MissionDef = {
  id: "heist",
  title: "Heist",
  objectives: [{ id: "meet", kind: "reach", actor: "player", marker: "far", next: "done" }],
};
const CATALOG = [ESCORT, HEIST];
const ORIGIN = { x: 0, y: 0, z: 0 };
const FAR = { x: 100, y: 0, z: 0 };

/** A mission marker as the editor places it, then edited in its inspector. */
function placed(id: string, meta: Record<string, unknown>): EditorMarker {
  return { id, kind: MISSION_MARKER_KIND, position: ORIGIN, label: "Mission marker", meta: { ...placeMetaFor(MISSION_MARKER_KIND).meta, ...meta } };
}

// Leave the shared registries as a catalog-free game would, so other suites see free-text mission ids.
afterEach(() => {
  clearTriggerActions();
  registerMissionMarkerKind();
});

describe("mission_marker scene kind", () => {
  test("registers a placeable marker kind in the Missions section that starts as a live trigger", () => {
    expect(registerMissionMarkerKind(CATALOG)).toBe(MISSION_MARKER_KIND);
    const definition = getSceneKind(MISSION_MARKER_KIND);
    expect(definition?.target).toBe("marker");
    expect(definition?.addCategory).toBe("Missions");
    expect(placeMetaFor(MISSION_MARKER_KIND).meta).toEqual({ on: "enter", action: "mission_start", triggerRadius: 2.5 });
    expect(getTriggerAction("mission_start")).toBeDefined();
  });

  test("the inspector's id fields are dropdowns of the catalog's mission, objective and fail-state ids", () => {
    const schema = missionMarkerSchema(CATALOG);
    const options = (key: string) => {
      const field = schema.fields.find((entry) => entry.key === key);
      return field?.type === "select" ? field.options.map((option) => option.value) : null;
    };
    expect(options("mission")).toEqual(["", "escort", "heist"]);
    expect(options("objective")).toEqual(["", "meet", "drop"]);
    expect(options("state")).toEqual(["", "failed", "ambushed"]);
    expect(options("on")).toEqual(["enter", "interact"]);
    expect(options("action")).toEqual(["mission_start", "mission_objective", "mission_fail"]);
    // Without a catalog the ids stay free text.
    expect(missionMarkerSchema().fields.find((entry) => entry.key === "mission")?.type).toBe("text");
  });

  test("schema validation rejects ids the catalog does not declare", () => {
    const schema = missionMarkerSchema(CATALOG);
    expect(validateParams(schema, { on: "enter", action: "mission_start", mission: "escort" })).toEqual([]);
    expect(validateParams(schema, { mission: "nope" }).map((issue) => issue.key)).toEqual(["mission"]);
    expect(validateParams(schema, { on: "exit", action: "teleport" }).map((issue) => issue.key)).toEqual(["on", "action"]);
  });

  test("round-trips through editor.scene.json and is collected as an authored trigger", () => {
    registerMissionMarkerKind(CATALOG);
    const marker = placed("start_escort", { mission: "escort", triggerRadius: 4 });
    const document = { ...createEmptyEditorDocument(), markers: [marker] };
    const decoded = decodeEditorDocument(JSON.parse(exportEditorDocumentJson(document)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.document.markers).toEqual([marker]);
    expect(collectAuthoredTriggers(decoded.document)).toEqual([
      {
        sourceId: "start_escort",
        sourceKind: "marker",
        objectKind: MISSION_MARKER_KIND,
        on: "enter",
        action: "mission_start",
        params: { mission: "escort" },
        radius: 4,
      },
    ]);
  });

  test("an actor entering fires the mission once per entry; leaving and re-entering fires it again", () => {
    registerMissionMarkerKind(CATALOG);
    const document = { markers: [placed("start_escort", { mission: "escort" }), { id: "far", kind: "poi", position: FAR }], volumes: [], paths: [] };
    const run = createMissionRuntime({ missions: CATALOG, markers: missionMarkers(document) });
    const bridge = createMissionTriggerBridge({ runtime: run, document });
    expect(bridge.step({ actors: [{ id: "player", position: [1, 0, 0] }] }).map((event) => `${event.on}:${event.action}`)).toEqual(["enter:mission_start"]);
    expect(run.state()?.missionId).toBe("escort");
    expect(bridge.step({ actors: [{ id: "player", position: [1, 0, 0] }] })).toEqual([]);
    run.abandon();
    expect(bridge.step({ actors: [{ id: "player", position: [50, 0, 0] }] })).toEqual([]);
    expect(bridge.step({ actors: [{ id: "player", position: [0, 0, 1] }] }).map((event) => event.on)).toEqual(["enter"]);
    expect(run.stats().started).toBe(2);
  });

  test("an interact marker fires only when the actor presses interact in range", () => {
    registerMissionMarkerKind(CATALOG);
    const document = { markers: [placed("board", { on: "interact", mission: "heist", triggerRadius: 5 })], volumes: [], paths: [] };
    const run = createMissionRuntime({ missions: CATALOG, markers: { far: FAR } });
    const bridge = createMissionTriggerBridge({ runtime: run, document });
    expect(bridge.step({ actors: [{ id: "player", position: [3, 0, 0] }] })).toEqual([]);
    expect(bridge.step({ actors: [{ id: "player", position: [8, 0, 0] }], interact: ["player"] })).toEqual([]);
    expect(run.state()).toBeNull();
    bridge.step({ actors: [{ id: "player", position: [4, 0, 0] }], interact: ["player"] });
    expect(run.state()?.missionId).toBe("heist");
  });
});

describe("validateMissionMarkers", () => {
  test("a marker naming known ids is valid", () => {
    const document = {
      markers: [
        placed("start", { mission: "escort" }),
        placed("drop", { action: "mission_objective", mission: "escort", objective: "drop" }),
        placed("ambush", { action: "mission_fail", mission: "escort", state: "ambushed" }),
      ],
      volumes: [{ id: "zone", kind: "zone", shape: "sphere" as const, center: ORIGIN, radius: 5, meta: { on: "interact", action: "mission_fail", mission: "heist", state: "failed" } }],
      paths: [],
    };
    expect(validateMissionMarkers(document, CATALOG)).toEqual([]);
  });

  test("reports unknown missions, foreign objectives and fail states, bad events and empty mission markers", () => {
    const document = {
      markers: [
        placed("lost", { mission: "nope" }),
        placed("unset", {}),
        placed("foreign", { action: "mission_objective", mission: "heist", objective: "drop" }),
        placed("state", { action: "mission_fail", mission: "heist", state: "ambushed" }),
        placed("exit", { on: "exit", mission: "escort" }),
        { id: "bare", kind: MISSION_MARKER_KIND, position: ORIGIN },
        { id: "plain", kind: "poi", position: ORIGIN },
      ],
      volumes: [],
      paths: [],
    };
    expect(validateMissionMarkers(document, CATALOG).map((issue) => `${issue.sourceId}.${issue.key}`)).toEqual([
      "lost.mission",
      "unset.mission",
      "foreign.objective",
      "state.state",
      "exit.on",
      "bare.action",
    ]);
  });
});
