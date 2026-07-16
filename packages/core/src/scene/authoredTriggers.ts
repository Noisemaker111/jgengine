/**
 * Authored behavior triggers on editor volumes and markers — a small `on`/`action` meta vocabulary
 * so "when player enters this volume, spawn wave 2" is scene data, not game code. Games declare
 * actions (typed via ParamSchema); the editor inspector renders their fields; a pure runtime
 * watches membership and dispatches to handlers.
 */

import type { SceneDocumentLike, SceneMarkerLike, SceneVolumeLike } from "../world/sceneShapes";
import { parseParams, type ParamSchema, type ParsedParams } from "./sceneKinds";

/** Event edge that can fire an authored trigger. */
export type TriggerEvent = "enter" | "exit" | "interact";

/** Document collection a trigger source lives on. */
export type TriggerSourceKind = "marker" | "volume";

/** Reserved meta keys for the trigger vocabulary — action params use every other schema field. @internal */
export const TRIGGER_ON_KEY = "on";
/** @internal */
export const TRIGGER_ACTION_KEY = "action";
/** @internal */
export const TRIGGER_RADIUS_KEY = "triggerRadius";
/** @internal */
export const TRIGGER_LIST_KEY = "triggers";

const TRIGGER_EVENTS: readonly TriggerEvent[] = ["enter", "exit", "interact"];

/** Default proximity radius (m) for marker enter/exit/interact when neither triggerRadius nor radius is set. @internal */
export const DEFAULT_TRIGGER_RADIUS = 2.5;

/**
 * A game-declared action the editor can assign to a volume/marker trigger. Schema drives the
 * inspector params; `targets`/`events` optionally narrow where it appears.
 */
export interface TriggerActionDefinition {
  id: string;
  /** Human label for the inspector action dropdown. */
  label: string;
  /** Param surface for this action — fields land flat on the object's `meta` (alongside `on`/`action`). */
  schema: ParamSchema;
  /** Which document collections accept this action. Default both. */
  targets?: readonly TriggerSourceKind[];
  /** Which events this action accepts. Default all (`enter`/`exit`/`interact`). */
  events?: readonly TriggerEvent[];
}

/** One resolved trigger binding from a document object. */
export interface AuthoredTrigger {
  sourceId: string;
  sourceKind: TriggerSourceKind;
  objectKind: string;
  on: TriggerEvent;
  action: string;
  params: ParsedParams;
  /** Proximity radius for marker sources; unused for volumes (shape owns containment). */
  radius: number;
}

/** Fired when a watched actor trips an authored trigger edge. */
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

/** Every registered action, optionally filtered by target collection. */
export function listTriggerActions(target?: TriggerSourceKind): TriggerActionDefinition[] {
  const all = [...actionRegistry.values()];
  if (target === undefined) return all;
  return all.filter((definition) => definition.targets === undefined || definition.targets.includes(target));
}

/** Clears the action registry — tests only. @internal */
export function clearTriggerActions(): void {
  actionRegistry.clear();
}

function isTriggerEvent(value: unknown): value is TriggerEvent {
  return typeof value === "string" && (TRIGGER_EVENTS as readonly string[]).includes(value);
}

function metaNumber(meta: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Resolve the proximity radius for a marker trigger from meta. @internal */
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

/**
 * Read every valid `on`/`action` binding off a raw meta bag. Unknown events/actions are dropped;
 * params are schema-parsed when the action is registered, else empty.
 * @internal
 */
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

/**
 * Collect every authored trigger on a document's markers and volumes. Pure — no runtime state.
 * Action params use the live {@link registerTriggerAction} registry when present.
 *
 * @capability authored-triggers schema'd on/action vocabulary on volumes and markers with runtime dispatch
 */
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
 * True when `point` is inside an editor volume (sphere / cylinder / box). Cylinder height defaults
 * to diameter when omitted; sphere ignores y for the common ground-plane case only when the volume
 * radius covers the full vertical span — here y is tested for sphere and box too.
 */
export function pointInVolume(
  volume: SceneVolumeLike,
  point: { x: number; y: number; z: number },
): boolean {
  const dx = point.x - volume.center.x;
  const dy = point.y - volume.center.y;
  const dz = point.z - volume.center.z;
  if (volume.shape === "box") {
    const hx = volume.halfExtents?.x ?? 5;
    const hy = volume.halfExtents?.y ?? 5;
    const hz = volume.halfExtents?.z ?? 5;
    return Math.abs(dx) <= hx && Math.abs(dy) <= hy && Math.abs(dz) <= hz;
  }
  const radius = volume.radius ?? 5;
  if (volume.shape === "cylinder") {
    const height = volume.height ?? radius * 2;
    if (Math.hypot(dx, dz) > radius) return false;
    return Math.abs(dy) <= height / 2;
  }
  return Math.hypot(dx, dy, dz) <= radius;
}

/** True when `point` is within `radius` of a marker's position (sphere for enter/exit/interact). @internal */
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
  /** Actor ids that pressed interact this frame — fires `on: "interact"` sources in range. */
  interact?: readonly string[];
}

/** Runtime handle that watches authored triggers against moving actors each tick. */
export interface AuthoredTriggerRuntime {
  /** Advance membership one tick; returns every edge fired and invokes handlers. */
  step(input: {
    actors: readonly {
      id: string;
      position: readonly [number, number, number] | { x: number; y: number; z: number };
    }[];
    /** Actor ids that pressed interact this frame — fires `on: "interact"` sources in range. */
    interact?: readonly string[];
  }): readonly TriggerDispatchEvent[];
  /** Drop membership so the next step re-fires enters for still-inside actors. */
  reset(): void;
  /** Snapshot of the triggers this runtime was built from. */
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

/**
 * Build a runtime that watches a document's authored triggers against moving actors and dispatches
 * to per-action handlers (and optional catch-all). Pure membership math; the game supplies actors
 * each tick from its own player/entity poses.
 *
 * @capability authored-triggers schema'd on/action vocabulary on volumes and markers with runtime dispatch
 */
export function createAuthoredTriggerRuntime(options: {
  document: SceneDocumentLike;
  handlers?: TriggerHandlers;
  /** Invoked for every dispatch after the matching handler (if any). */
  onDispatch?: (event: TriggerDispatchEvent) => void;
  /** Override the collected trigger list (tests / hot-reload). Default: {@link collectAuthoredTriggers}. */
  triggers?: readonly AuthoredTrigger[];
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

/** Read the single flat trigger (`on`/`action`) from meta for the inspector, ignoring non-empty multi-lists. @internal */
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
