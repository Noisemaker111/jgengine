/**
 * Missions driven from authored scene markers. A designer places a marker (or volume) in the editor
 * and sets one of the registered mission actions in the inspector — `mission_start`,
 * `mission_objective` or `mission_fail` — and the runtime starts, advances or fails the mission when
 * an actor trips it. Nothing about the marker is mission-specific code; it is the shared authored
 * trigger vocabulary, plus the marker positions a positional objective reads.
 */

import {
  createAuthoredTriggerRuntime,
  registerTriggerAction,
  type AuthoredTrigger,
  type AuthoredTriggerRuntime,
  type TriggerActionDefinition,
  type TriggerDispatchEvent,
} from "../scene/authoredTriggers";
import type { SceneDocumentLike, ScenePoint3 } from "../world/sceneShapes";
import type { MissionRuntime } from "./mission";

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

/**
 * The mission actions a game registers so the editor inspector can assign them to a marker or volume.
 * Params land flat on the object's `meta` beside `on`/`action`, like any authored trigger.
 *
 * @capability mission-triggers start, advance and fail a mission from authored scene markers
 */
export const MISSION_TRIGGER_ACTIONS: readonly TriggerActionDefinition[] = [
  {
    id: "mission_start",
    label: "Start mission",
    schema: { fields: [{ type: "text", key: "mission", label: "Mission", default: "" }] },
    events: ["enter"],
  },
  {
    id: "mission_objective",
    label: "Complete mission objective",
    schema: {
      fields: [
        { type: "text", key: "mission", label: "Mission", default: "" },
        { type: "text", key: "objective", label: "Objective", default: "" },
      ],
    },
    events: ["enter", "interact"],
  },
  {
    id: "mission_fail",
    label: "Fail mission",
    schema: {
      fields: [
        { type: "text", key: "mission", label: "Mission", default: "" },
        { type: "text", key: "state", label: "Fail state", default: "" },
      ],
    },
    events: ["enter", "interact"],
  },
];

/**
 * Register {@link MISSION_TRIGGER_ACTIONS} so the editor lists them. Idempotent; call at module load
 * next to the game's catalogs.
 *
 * @capability mission-triggers start, advance and fail a mission from authored scene markers
 */
export function registerMissionTriggerActions(): void {
  for (const action of MISSION_TRIGGER_ACTIONS) registerTriggerAction(action);
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
