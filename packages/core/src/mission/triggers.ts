/**
 * Missions driven from authored scene markers. A designer places a `mission_marker` (or sets a
 * mission action on any marker or volume) in the editor — `mission_start`, `mission_objective` or
 * `mission_fail` — and the runtime starts, advances or fails the mission when an actor trips it.
 * Nothing about the marker is mission-specific code; it is the shared authored trigger vocabulary,
 * plus the marker positions a positional objective reads.
 */

import type { ParamField, ParamSchema } from "../generator/paramSchema";
import {
  DEFAULT_TRIGGER_RADIUS,
  TRIGGER_ACTION_KEY,
  TRIGGER_ON_KEY,
  TRIGGER_RADIUS_KEY,
  TRIGGER_LIST_KEY,
  createAuthoredTriggerRuntime,
  registerTriggerAction,
  type AuthoredTrigger,
  type AuthoredTriggerRuntime,
  type TriggerActionDefinition,
  type TriggerDispatchEvent,
  type TriggerEvent,
} from "../scene/authoredTriggers";
import { registerSceneKind } from "../scene/sceneKinds";
import type { SceneDocumentLike, ScenePoint3 } from "../world/sceneShapes";
import type { MissionDef, MissionRuntime } from "./mission";

/**
 * Marker positions from an authored scene, keyed by marker id — what a positional objective reads.
 *
 * @capability mission-triggers read authored scene marker positions for positional objectives
 */
export function missionMarkers(document: SceneDocumentLike): Record<string, ScenePoint3> {
  const out: Record<string, ScenePoint3> = {};
  for (const marker of document.markers) {
    out[marker.id] = { x: marker.position.x, y: marker.position.y, z: marker.position.z };
  }
  return out;
}

/** The mission trigger actions, in inspector order. */
export const MISSION_TRIGGER_ACTION_IDS = ["mission_start", "mission_objective", "mission_fail"] as const;

/** One of {@link MISSION_TRIGGER_ACTION_IDS}. */
export type MissionTriggerActionId = (typeof MISSION_TRIGGER_ACTION_IDS)[number];

/** The events a mission action fires on: walking in, or pressing interact in range. */
const MISSION_TRIGGER_EVENTS: readonly TriggerEvent[] = ["enter", "interact"];

/** The fail state a mission lands in when nothing names one. */
const DEFAULT_FAIL_STATE = "failed";

interface MissionIdOptions {
  missions: { value: string; label: string }[];
  objectives: { value: string; label: string }[];
  states: { value: string; label: string }[];
}

/** Every mission, objective and fail-state id a catalog declares, as dropdown options. */
function missionIdOptions(missions: readonly MissionDef[]): MissionIdOptions {
  const objectiveOwners = new Map<string, string[]>();
  const stateOwners = new Map<string, string[]>([[DEFAULT_FAIL_STATE, []]]);
  for (const mission of missions) {
    for (const objective of mission.objectives) {
      (objectiveOwners.get(objective.id) ?? objectiveOwners.set(objective.id, []).get(objective.id)!).push(mission.id);
    }
    for (const state of mission.fail ?? []) {
      (stateOwners.get(state.id) ?? stateOwners.set(state.id, []).get(state.id)!).push(mission.id);
    }
  }
  const owned = (owners: Map<string, string[]>) =>
    [...owners].map(([value, ids]) => ({ value, label: ids.length === 0 ? value : `${value} (${ids.join(", ")})` }));
  return {
    missions: missions.map((mission) => ({ value: mission.id, label: `${mission.title} (${mission.id})` })),
    objectives: owned(objectiveOwners),
    states: owned(stateOwners),
  };
}

/** A dropdown of the catalog's ids when one is given, else a free text id. */
function idField(key: string, label: string, options: readonly { value: string; label: string }[] | undefined): ParamField {
  if (options === undefined) return { type: "text", key, label, default: "" };
  return { type: "select", key, label, options: [{ value: "", label: "— choose —" }, ...options], default: "" };
}

/**
 * The mission actions, as the editor inspector lists them. Given the game's mission catalog, the
 * mission, objective and fail-state params are dropdowns of its ids; without one they are free text.
 * Params land flat on the object's `meta` beside `on`/`action`, like any authored trigger.
 *
 * @capability mission-triggers start, advance and fail a mission from authored scene markers
 */
export function missionTriggerActions(missions?: readonly MissionDef[]): TriggerActionDefinition[] {
  const options = missions === undefined ? undefined : missionIdOptions(missions);
  const mission = idField("mission", "Mission", options?.missions);
  return [
    { id: "mission_start", label: "Start mission", schema: { fields: [mission] }, events: MISSION_TRIGGER_EVENTS },
    {
      id: "mission_objective",
      label: "Complete mission objective",
      schema: { fields: [mission, idField("objective", "Objective", options?.objectives)] },
      events: MISSION_TRIGGER_EVENTS,
    },
    {
      id: "mission_fail",
      label: "Fail mission",
      schema: { fields: [mission, idField("state", "Fail state", options?.states)] },
      events: MISSION_TRIGGER_EVENTS,
    },
  ];
}

/**
 * The mission actions with free-text ids, for a game that registers them without its catalog.
 *
 * @capability mission-triggers start, advance and fail a mission from authored scene markers
 */
export const MISSION_TRIGGER_ACTIONS: readonly TriggerActionDefinition[] = missionTriggerActions();

/**
 * Register the mission actions so the editor lists them. Pass the game's mission catalog to turn
 * the id params into dropdowns of its mission, objective and fail-state ids. Idempotent; call at
 * module load next to the game's catalogs.
 *
 * @capability mission-triggers start, advance and fail a mission from authored scene markers
 */
export function registerMissionTriggerActions(missions?: readonly MissionDef[]): void {
  for (const action of missionTriggerActions(missions)) registerTriggerAction(action);
}

/**
 * The scene kind a designer places for a mission trigger: a marker whose inspector edits exactly the
 * `meta` the mission trigger runtime reads (`on`, `action`, `mission`/`objective`/`state`,
 * `triggerRadius`), so `collectAuthoredTriggers` and {@link createMissionTriggerBridge} read
 * it like any other authored trigger.
 *
 * @capability mission-triggers place mission triggers from the editor palette
 */
export const MISSION_MARKER_KIND = "mission_marker";

/**
 * The `mission_marker` inspector schema. Given the game's mission catalog, the id fields are
 * dropdowns of its ids.
 *
 * @capability mission-triggers place mission triggers from the editor palette
 */
export function missionMarkerSchema(missions?: readonly MissionDef[]): ParamSchema {
  const options = missions === undefined ? undefined : missionIdOptions(missions);
  return {
    fields: [
      {
        type: "select",
        key: TRIGGER_ON_KEY,
        label: "Fires on",
        options: MISSION_TRIGGER_EVENTS.map((event) => ({ value: event, label: event === "enter" ? "Enter" : "Interact" })),
        default: "enter",
      },
      {
        type: "select",
        key: TRIGGER_ACTION_KEY,
        label: "Action",
        options: [
          { value: "mission_start", label: "Start mission" },
          { value: "mission_objective", label: "Complete objective" },
          { value: "mission_fail", label: "Fail mission" },
        ],
        default: "mission_start",
      },
      idField("mission", "Mission", options?.missions),
      idField("objective", "Objective (complete)", options?.objectives),
      idField("state", "Fail state (fail)", options?.states),
      { type: "number", key: TRIGGER_RADIUS_KEY, label: "Trigger radius (m)", min: 0, step: 0.5, default: DEFAULT_TRIGGER_RADIUS },
    ],
  };
}

/**
 * Make `mission_marker` a click-to-place tool in the editor's `+ Add` menu (under "Missions") and
 * register the mission actions it uses, both with dropdowns of the game's mission catalog. A placed
 * marker starts as "enter → start mission" so it is a live trigger from the first click. Call at
 * module load from a module the editor loads (the game's `editorLayers` import graph).
 *
 * @capability mission-triggers place mission triggers from the editor palette
 */
export function registerMissionMarkerKind(missions?: readonly MissionDef[]): string {
  registerMissionTriggerActions(missions);
  registerSceneKind({
    kind: MISSION_MARKER_KIND,
    target: "marker",
    label: "Mission marker",
    addCategory: "Missions",
    accent: "#fb7185",
    schema: missionMarkerSchema(missions),
    placeMeta: { [TRIGGER_ON_KEY]: "enter", [TRIGGER_ACTION_KEY]: "mission_start", [TRIGGER_RADIUS_KEY]: DEFAULT_TRIGGER_RADIUS },
    note: (_object, params) => {
      const action = String(params[TRIGGER_ACTION_KEY] ?? "");
      const mission = String(params["mission"] ?? "") || "?";
      const detail = action === "mission_objective" ? ` · ${String(params["objective"] ?? "") || "?"}` : action === "mission_fail" ? ` → ${String(params["state"] ?? "") || "?"}` : "";
      return `${String(params[TRIGGER_ON_KEY] ?? "")} → ${action} ${mission}${detail}`;
    },
  });
  return MISSION_MARKER_KIND;
}

/** One problem {@link validateMissionMarkers} found on an authored mission trigger. */
export interface MissionMarkerIssue {
  /** Marker or volume id. */
  sourceId: string;
  /** The `meta` key at fault. */
  key: string;
  message: string;
}

function isMissionAction(value: unknown): value is MissionTriggerActionId {
  return typeof value === "string" && (MISSION_TRIGGER_ACTION_IDS as readonly string[]).includes(value);
}

/**
 * The raw mission trigger rows on a meta bag — the flat `on`/`action` or each `triggers` list row —
 * read off the raw meta, not schema-parsed params, so an id the catalog lacks is still seen.
 */
function missionTriggerRows(meta: Record<string, unknown> | undefined): { on: unknown; action: MissionTriggerActionId; row: Record<string, unknown> }[] {
  if (meta === undefined) return [];
  const list = meta[TRIGGER_LIST_KEY];
  const rows = Array.isArray(list) && list.length > 0
    ? list.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    : [meta];
  const out: { on: unknown; action: MissionTriggerActionId; row: Record<string, unknown> }[] = [];
  for (const row of rows) {
    const action = row[TRIGGER_ACTION_KEY];
    if (isMissionAction(action)) out.push({ on: row[TRIGGER_ON_KEY], action, row });
  }
  return out;
}

/**
 * Check every authored mission trigger in a document against the game's mission catalog: each names
 * a known mission, an objective of that mission, a fail state of that mission, and an event mission
 * actions fire on. A `mission_marker` with no trigger set is reported too. Empty means valid.
 *
 * @capability mission-triggers validate authored mission triggers against the mission catalog
 */
export function validateMissionMarkers(document: SceneDocumentLike, missions: readonly MissionDef[]): MissionMarkerIssue[] {
  const issues: MissionMarkerIssue[] = [];
  const byId = new Map(missions.map((mission) => [mission.id, mission]));
  const sources = [
    ...document.markers.map((marker) => ({ id: marker.id, kind: marker.kind, meta: marker.meta })),
    ...document.volumes.map((volume) => ({ id: volume.id, kind: volume.kind, meta: volume.meta })),
  ];
  for (const source of sources) {
    const rows = missionTriggerRows(source.meta);
    if (source.kind === MISSION_MARKER_KIND && rows.length === 0) {
      issues.push({ sourceId: source.id, key: TRIGGER_ACTION_KEY, message: "mission marker has no mission action set" });
      continue;
    }
    for (const spec of rows) {
      const text = (key: string) => (typeof spec.row[key] === "string" ? (spec.row[key] as string) : "");
      if (!(MISSION_TRIGGER_EVENTS as readonly unknown[]).includes(spec.on)) {
        issues.push({ sourceId: source.id, key: TRIGGER_ON_KEY, message: `${spec.action} fires on enter or interact, not ${String(spec.on)}` });
      }
      const missionId = text("mission");
      const mission = byId.get(missionId);
      if (mission === undefined) {
        issues.push({ sourceId: source.id, key: "mission", message: missionId === "" ? "no mission chosen" : `unknown mission "${missionId}"` });
        continue;
      }
      if (spec.action === "mission_objective") {
        const objective = text("objective");
        if (!mission.objectives.some((entry) => entry.id === objective)) {
          issues.push({ sourceId: source.id, key: "objective", message: `"${objective}" is not an objective of ${mission.id}` });
        }
      }
      if (spec.action === "mission_fail") {
        const state = text("state");
        if (state !== DEFAULT_FAIL_STATE && !(mission.fail ?? []).some((entry) => entry.id === state)) {
          issues.push({ sourceId: source.id, key: "state", message: `"${state}" is not a fail state of ${mission.id}` });
        }
      }
    }
  }
  return issues;
}

/** Watches a document's authored mission triggers against moving actors. */
export interface MissionTriggerBridge {
  /** Advance one tick; fires the mission actions the actors tripped. */
  step(input: {
    actors: readonly {
      id: string;
      position: readonly [number, number, number] | { x: number; y: number; z: number };
    }[];
    interact?: readonly string[];
  }): readonly TriggerDispatchEvent[];
  /** The mission triggers this bridge was built from. */
  triggers(): readonly AuthoredTrigger[];
  /** Drop membership so the next step re-fires enters for still-inside actors. */
  reset(): void;
}

function textParam(event: TriggerDispatchEvent, key: string): string | undefined {
  const value = event.params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Wire authored markers to a {@link MissionRuntime}: an actor entering a `mission_start` marker starts
 * the named mission, `mission_objective` completes the named objective, and `mission_fail` lands the
 * named fail state. Pure membership math over the document, exactly like any other authored trigger.
 *
 * @capability mission-triggers start, advance and fail a mission from authored scene markers
 */
export function createMissionTriggerBridge(options: {
  runtime: MissionRuntime;
  document: SceneDocumentLike;
  triggers?: readonly AuthoredTrigger[];
}): MissionTriggerBridge {
  const handlers = {
    mission_start: (event: TriggerDispatchEvent) => {
      const mission = textParam(event, "mission");
      if (mission !== undefined) options.runtime.start(mission);
    },
    mission_objective: (event: TriggerDispatchEvent) => {
      const mission = textParam(event, "mission");
      const objective = textParam(event, "objective");
      if (mission !== undefined && objective !== undefined) options.runtime.signal(mission, objective);
    },
    mission_fail: (event: TriggerDispatchEvent) => {
      const mission = textParam(event, "mission");
      const state = textParam(event, "state");
      if (mission !== undefined && state !== undefined) options.runtime.fail(mission, state);
    },
  };
  const runtime: AuthoredTriggerRuntime = createAuthoredTriggerRuntime({
    document: options.document,
    handlers,
    triggers: options.triggers,
  });
  return {
    step: (input) => runtime.step(input),
    triggers: () => runtime.triggers(),
    reset: () => runtime.reset(),
  };
}
