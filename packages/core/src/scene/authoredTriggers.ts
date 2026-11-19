import { volumeHalfSize, type SceneDocumentLike, type SceneMarkerLike, type SceneVolumeLike } from "../world/sceneShapes";
import { parseParams, type ParamSchema, type ParsedParams } from "../generator/paramSchema";

export type TriggerEvent = "enter" | "exit" | "interact";

export type TriggerSourceKind = "marker" | "volume";

/** @internal */
export const TRIGGER_ON_KEY = "on";
/** @internal */
export const TRIGGER_ACTION_KEY = "action";
/** @internal */
export const TRIGGER_RADIUS_KEY = "triggerRadius";
/** @internal */
export const TRIGGER_LIST_KEY = "triggers";

const TRIGGER_EVENTS: readonly TriggerEvent[] = ["enter", "exit", "interact"];

/** @internal */
export const DEFAULT_TRIGGER_RADIUS = 2.5;

export interface TriggerActionDefinition {
  id: string;
  label: string;
  schema: ParamSchema;
  targets?: readonly TriggerSourceKind[];
  events?: readonly TriggerEvent[];
}

export interface AuthoredTrigger {
  sourceId: string;
  sourceKind: TriggerSourceKind;
  objectKind: string;
  on: TriggerEvent;
  action: string;
  params: ParsedParams;
  radius: number;
}

export interface TriggerDispatchEvent {
  on: TriggerEvent;
  action: string;
  sourceId: string;
  sourceKind: TriggerSourceKind;
  objectKind: string;
  actorId: string;
  params: ParsedParams;
}

/** Handler map keyed by action id — unknown actions are skipped unless `onDispatch` is set. */
export type TriggerHandlers = Readonly<Record<string, (event: TriggerDispatchEvent) => void>>;

const actionRegistry = new Map<string, TriggerActionDefinition>();

/**
 * Declare a game action the editor can assign to volume/marker triggers. Idempotent per `id`
 * (last registration wins). Call at module load next to catalogs.
 *
 * @capability authored-triggers schema'd on/action vocabulary on volumes and markers with runtime dispatch
 */
export function registerTriggerAction(definition: TriggerActionDefinition): void {
  actionRegistry.set(definition.id, definition);
}

/** Registered definition for an action id, or undefined when the game never declared it. */
export function getTriggerAction(id: string): TriggerActionDefinition | undefined {
  return actionRegistry.get(id);
}

export function listTriggerActions(target?: TriggerSourceKind): TriggerActionDefinition[] {
  const all = [...actionRegistry.values()];
  if (target === undefined) return all;
  return all.filter((definition) => definition.targets === undefined || definition.targets.includes(target));
}

/** @internal */
export function clearTriggerActions(): void {
  actionRegistry.clear();
}

/** @capability authored-triggers built-in announce/win/advance actions authorable on any marker or volume */
export const BUILTIN_TRIGGER_ACTIONS: readonly TriggerActionDefinition[] = [
  {
    id: "announce",
    label: "Announce",
    schema: {
      fields: [
        { type: "text", key: "message", label: "Message", default: "Entered zone" },
        {
          type: "select",
          key: "tone",
          label: "Tone",
          options: [
            { value: "info", label: "Info" },
            { value: "warn", label: "Warn" },
            { value: "good", label: "Good" },
          ],
          default: "info",
        },
      ],
    },
  },
  {
    id: "win",
    label: "Win the game",
    schema: {
      fields: [{ type: "text", key: "message", label: "Message", default: "You win!" }],
    },
  },
  {
    id: "advance",
    label: "Advance objective",
    schema: {
      fields: [
        { type: "text", key: "objective", label: "Next objective", default: "" },
        { type: "text", key: "message", label: "Message", default: "" },
      ],
    },
  },
];

/**
 * Register the engine's built-in {@link BUILTIN_TRIGGER_ACTIONS} so they appear in the editor's
 * trigger inspector. Idempotent; call at module load (a game may still register its own actions or
 * re-register a built-in id to override it).
 *
 * @capability authored-triggers register the shared announce/win/advance actions
 */
export function registerBuiltinTriggerActions(): void {
  for (const definition of BUILTIN_TRIGGER_ACTIONS) registerTriggerAction(definition);
}

function isTriggerEvent(value: unknown): value is TriggerEvent {
  return typeof value === "string" && (TRIGGER_EVENTS as readonly string[]).includes(value);
}

function metaNumber(meta: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** @internal */
export function triggerRadiusOf(meta: Record<string, unknown> | undefined, fallback = DEFAULT_TRIGGER_RADIUS): number {
  const explicit = metaNumber(meta, TRIGGER_RADIUS_KEY) ?? metaNumber(meta, "radius");
  if (explicit === undefined) return fallback;
  return Math.max(0, explicit);
}

interface TriggerSpec {
  on: TriggerEvent;
  action: string;
  paramsMeta: Record<string, unknown> | undefined;
}

function specsFromMeta(meta: Record<string, unknown> | undefined): TriggerSpec[] {
  if (meta === undefined) return [];
  const list = meta[TRIGGER_LIST_KEY];
  if (Array.isArray(list)) {
    if (list.length === 0) {
      // Empty multi-list is the inspector's "cleared" sentinel — fall through to flat on/action.
    } else {
      const out: TriggerSpec[] = [];
      for (const entry of list) {
        if (typeof entry !== "object" || entry === null) continue;
        const row = entry as Record<string, unknown>;
        if (!isTriggerEvent(row[TRIGGER_ON_KEY])) continue;
        const action = row[TRIGGER_ACTION_KEY];
        if (typeof action !== "string" || action.length === 0) continue;
        out.push({ on: row[TRIGGER_ON_KEY], action, paramsMeta: row });
      }
      return out;
    }
  }
  if (!isTriggerEvent(meta[TRIGGER_ON_KEY])) return [];
  const action = meta[TRIGGER_ACTION_KEY];
  if (typeof action !== "string" || action.length === 0) return [];
  return [{ on: meta[TRIGGER_ON_KEY], action, paramsMeta: meta }];
}

function resolveParams(actionId: string, paramsMeta: Record<string, unknown> | undefined): ParsedParams {
  const definition = actionRegistry.get(actionId);
  if (definition === undefined) return {};
  return parseParams(definition.schema, paramsMeta);
}

/** @internal */
export function readTriggerSpecs(meta: Record<string, unknown> | undefined): readonly {
  on: TriggerEvent;
  action: string;
  params: ParsedParams;
}[] {
  return specsFromMeta(meta).map((spec) => ({
    on: spec.on,
    action: spec.action,
    params: resolveParams(spec.action, spec.paramsMeta),
  }));
}

/** @capability authored-triggers schema'd on/action vocabulary on volumes and markers with runtime dispatch */
export function collectAuthoredTriggers(document: SceneDocumentLike): AuthoredTrigger[] {
  const out: AuthoredTrigger[] = [];
  for (const marker of document.markers) {
    const radius = triggerRadiusOf(marker.meta);
    for (const spec of readTriggerSpecs(marker.meta)) {
      out.push({
        sourceId: marker.id,
        sourceKind: "marker",
        objectKind: marker.kind,
        on: spec.on,
        action: spec.action,
        params: spec.params,
        radius,
      });
    }
  }
  for (const volume of document.volumes) {
    for (const spec of readTriggerSpecs(volume.meta)) {
      out.push({
        sourceId: volume.id,
        sourceKind: "volume",
        objectKind: volume.kind,
        on: spec.on,
        action: spec.action,
        params: spec.params,
        radius: 0,
      });
    }
  }
  return out;
}

/**
 * True when `point` is inside an editor volume (sphere / cylinder / box), whose bounds are centred on
 * `center` ({@link volumeHalfSize}). Cylinder height defaults to its diameter when omitted.
 */
export function pointInVolume(
  volume: SceneVolumeLike,
  point: { x: number; y: number; z: number },
): boolean {
  const dx = point.x - volume.center.x;
  const dy = point.y - volume.center.y;
  const dz = point.z - volume.center.z;
  const half = volumeHalfSize(volume);
  if (volume.shape === "box") return Math.abs(dx) <= half.x && Math.abs(dy) <= half.y && Math.abs(dz) <= half.z;
  if (volume.shape === "cylinder") return Math.hypot(dx, dz) <= half.x && Math.abs(dy) <= half.y;
  return Math.hypot(dx, dy, dz) <= half.x;
}

/** @internal */
export function pointNearMarker(
  marker: SceneMarkerLike,
  point: { x: number; y: number; z: number },
  radius: number,
): boolean {
  const dx = point.x - marker.position.x;
  const dy = point.y - marker.position.y;
  const dz = point.z - marker.position.z;
  return Math.hypot(dx, dy, dz) <= radius;
}

function membershipKey(sourceId: string, actorId: string): string {
  return `${sourceId}\0${actorId}`;
}

/** @internal */
export interface TriggerActor {
  id: string;
  position: readonly [number, number, number] | { x: number; y: number; z: number };
}

/** @internal */
export interface AuthoredTriggerStepInput {
  actors: readonly TriggerActor[];
  interact?: readonly string[];
}

export interface AuthoredTriggerRuntime {
  step(input: {
    actors: readonly {
      id: string;
      position: readonly [number, number, number] | { x: number; y: number; z: number };
    }[];
    interact?: readonly string[];
  }): readonly TriggerDispatchEvent[];
  /** Drop membership so the next step re-fires enters for still-inside actors. */
  reset(): void;
  triggers(): readonly AuthoredTrigger[];
}

function actorPoint(actor: TriggerActor): { x: number; y: number; z: number } {
  const p = actor.position;
  if (Array.isArray(p)) return { x: p[0]!, y: p[1]!, z: p[2]! };
  return p as { x: number; y: number; z: number };
}

function insideSource(
  document: SceneDocumentLike,
  trigger: AuthoredTrigger,
  point: { x: number; y: number; z: number },
): boolean {
  if (trigger.sourceKind === "volume") {
    const volume = document.volumes.find((entry) => entry.id === trigger.sourceId);
    return volume !== undefined && pointInVolume(volume, point);
  }
  const marker = document.markers.find((entry) => entry.id === trigger.sourceId);
  return marker !== undefined && pointNearMarker(marker, point, trigger.radius);
}

/** @capability authored-triggers schema'd on/action vocabulary on volumes and markers with runtime dispatch */
export function createAuthoredTriggerRuntime(options: {
  document: SceneDocumentLike;
  handlers?: TriggerHandlers;
  /** Invoked for every dispatch after the matching handler (if any). */
  onDispatch?: (event: TriggerDispatchEvent) => void;
  /** Override the collected trigger list (tests / hot-reload). Default: {@link collectAuthoredTriggers}. */
  triggers?: readonly AuthoredTrigger[] | undefined;
}): AuthoredTriggerRuntime {
  const document = options.document;
  const triggers = options.triggers ?? collectAuthoredTriggers(document);
  let members = new Set<string>();

  const sourceIds = new Map<string, AuthoredTrigger[]>();
  for (const trigger of triggers) {
    const list = sourceIds.get(trigger.sourceId) ?? [];
    list.push(trigger);
    sourceIds.set(trigger.sourceId, list);
  }

  function emit(events: TriggerDispatchEvent[]): void {
    for (const event of events) {
      options.handlers?.[event.action]?.(event);
      options.onDispatch?.(event);
    }
  }

  return {
    triggers: () => triggers,
    reset() {
      members = new Set();
    },
    step(input) {
      const next = new Set<string>();
      const insideNow = new Map<string, Set<string>>();
      for (const actor of input.actors) {
        const point = actorPoint(actor);
        for (const [sourceId, sourceTriggers] of sourceIds) {
          const probe = sourceTriggers[0]!;
          if (!insideSource(document, probe, point)) continue;
          const key = membershipKey(sourceId, actor.id);
          next.add(key);
          let set = insideNow.get(sourceId);
          if (set === undefined) {
            set = new Set();
            insideNow.set(sourceId, set);
          }
          set.add(actor.id);
        }
      }

      const events: TriggerDispatchEvent[] = [];
      for (const [sourceId, actorsInside] of insideNow) {
        const sourceTriggers = sourceIds.get(sourceId) ?? [];
        for (const actorId of actorsInside) {
          const key = membershipKey(sourceId, actorId);
          const wasInside = members.has(key);
          if (!wasInside) {
            for (const trigger of sourceTriggers) {
              if (trigger.on !== "enter") continue;
              events.push({
                on: "enter",
                action: trigger.action,
                sourceId: trigger.sourceId,
                sourceKind: trigger.sourceKind,
                objectKind: trigger.objectKind,
                actorId,
                params: trigger.params,
              });
            }
          }
        }
      }

      for (const key of members) {
        if (next.has(key)) continue;
        const sep = key.indexOf("\0");
        const sourceId = key.slice(0, sep);
        const actorId = key.slice(sep + 1);
        for (const trigger of sourceIds.get(sourceId) ?? []) {
          if (trigger.on !== "exit") continue;
          events.push({
            on: "exit",
            action: trigger.action,
            sourceId: trigger.sourceId,
            sourceKind: trigger.sourceKind,
            objectKind: trigger.objectKind,
            actorId,
            params: trigger.params,
          });
        }
      }

      const interactActors = new Set(input.interact ?? []);
      if (interactActors.size > 0) {
        for (const actor of input.actors) {
          if (!interactActors.has(actor.id)) continue;
          const point = actorPoint(actor);
          for (const sourceTriggers of sourceIds.values()) {
            const probe = sourceTriggers[0]!;
            if (!insideSource(document, probe, point)) continue;
            for (const trigger of sourceTriggers) {
              if (trigger.on !== "interact") continue;
              events.push({
                on: "interact",
                action: trigger.action,
                sourceId: trigger.sourceId,
                sourceKind: trigger.sourceKind,
                objectKind: trigger.objectKind,
                actorId: actor.id,
                params: trigger.params,
              });
            }
          }
        }
      }

      members = next;
      emit(events);
      return events;
    },
  };
}

export interface TriggerOutcome {
  won: boolean;
  message: string | null;
  tone: string;
  objective: string | null;
  revision: number;
}

export interface TriggerOutcomeStore {
  get(): TriggerOutcome;
  subscribe(listener: () => void): () => void;
  handlers: TriggerHandlers;
  reset(): void;
}

const INITIAL_OUTCOME: TriggerOutcome = { won: false, message: null, tone: "info", objective: null, revision: 0 };

/** @capability authored-triggers headless win/announce/objective outcome for the built-in actions */
export function createTriggerOutcome(): TriggerOutcomeStore {
  let outcome: TriggerOutcome = INITIAL_OUTCOME;
  const listeners = new Set<() => void>();
  const commit = (next: Omit<TriggerOutcome, "revision">): void => {
    outcome = { ...next, revision: outcome.revision + 1 };
    for (const listener of listeners) listener();
  };
  const messageOf = (event: TriggerDispatchEvent, fallback: string): string => {
    const value = event.params["message"];
    return typeof value === "string" && value.length > 0 ? value : fallback;
  };
  const stringParam = (event: TriggerDispatchEvent, key: string): string | undefined => {
    const value = event.params[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  return {
    get: () => outcome,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    handlers: {
      announce: (event) => {
        commit({ won: outcome.won, message: messageOf(event, "Entered zone"), tone: stringParam(event, "tone") ?? "info", objective: outcome.objective });
      },
      win: (event) => {
        commit({ won: true, message: messageOf(event, "You win!"), tone: "good", objective: outcome.objective });
      },
      advance: (event) => {
        commit({
          won: outcome.won,
          message: stringParam(event, "message") ?? outcome.message,
          tone: outcome.tone,
          objective: stringParam(event, "objective") ?? outcome.objective,
        });
      },
    },
    reset() {
      outcome = INITIAL_OUTCOME;
      for (const listener of listeners) listener();
    },
  };
}

/**
 * Build a meta patch that sets a single flat trigger (`on` + `action` + optional param fields) and
 * clears a multi-trigger list if present. Used by the editor inspector.
 * @internal
 */
export function triggerMetaPatch(
  on: TriggerEvent | "",
  action: string,
  params: Record<string, unknown> = {},
): Record<string, unknown> {
  if (on === "" || action.length === 0) {
    return { [TRIGGER_ON_KEY]: undefined, [TRIGGER_ACTION_KEY]: undefined, [TRIGGER_LIST_KEY]: undefined };
  }
  return {
    [TRIGGER_ON_KEY]: on,
    [TRIGGER_ACTION_KEY]: action,
    [TRIGGER_LIST_KEY]: undefined,
    ...params,
  };
}

/** @internal */
export function readFlatTrigger(meta: Record<string, unknown> | undefined): {
  on: TriggerEvent | "";
  action: string;
} {
  if (meta === undefined) return { on: "", action: "" };
  const list = meta[TRIGGER_LIST_KEY];
  if (Array.isArray(list) && list.length > 0) return { on: "", action: "" };
  const on = isTriggerEvent(meta[TRIGGER_ON_KEY]) ? meta[TRIGGER_ON_KEY] : "";
  const action = typeof meta[TRIGGER_ACTION_KEY] === "string" ? (meta[TRIGGER_ACTION_KEY] as string) : "";
  return { on, action };
}
