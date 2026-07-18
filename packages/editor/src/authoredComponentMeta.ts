import {
  listTriggerActions,
  readFlatTrigger,
  TRIGGER_ACTION_KEY,
  TRIGGER_LIST_KEY,
  TRIGGER_ON_KEY,
  TRIGGER_RADIUS_KEY,
  type TriggerSourceKind,
} from "@jgengine/core/scene/authoredTriggers";
import { defaultParamMeta } from "@jgengine/core/scene/sceneKinds";

/**
 * True when an object's meta carries an authored behavior trigger (flat on/action or a multi-list).
 * Empty `on` / no list means the trigger component is not installed.
 */
export function hasAuthoredTrigger(meta: Record<string, unknown> | undefined): boolean {
  if (meta === undefined) return false;
  const list = meta[TRIGGER_LIST_KEY];
  if (Array.isArray(list) && list.length > 0) return true;
  const flat = readFlatTrigger(meta);
  return flat.on !== "" && flat.action.length > 0;
}

/** True when the game has registered at least one trigger action for this target kind. */
export function canAuthorTrigger(target: TriggerSourceKind): boolean {
  return listTriggerActions(target).length > 0;
}

/**
 * Meta patch that installs a default trigger (first registered action, enter event) without
 * inventing action ids. Returns null when no actions are registered.
 */
export function defaultTriggerInstallPatch(
  target: TriggerSourceKind,
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  const actions = listTriggerActions(target);
  const first = actions[0];
  if (first === undefined) return null;
  const events = first.events;
  const on = events !== undefined && events.length > 0 ? events[0]! : "enter";
  const patch: Record<string, unknown> = {
    [TRIGGER_ON_KEY]: on,
    [TRIGGER_ACTION_KEY]: first.id,
    [TRIGGER_LIST_KEY]: [],
  };
  const defaults = defaultParamMeta(first.schema);
  for (const [key, value] of Object.entries(defaults)) {
    if (meta?.[key] === undefined) patch[key] = value;
  }
  return patch;
}

/**
 * Meta patch that clears the trigger vocabulary keys. Action-specific params are left in place so
 * re-adding the same action keeps prior tuning; the component is considered removed once `on`/`action`/list are gone.
 */
export function clearTriggerInstallPatch(): Record<string, unknown> {
  return {
    [TRIGGER_ON_KEY]: "",
    [TRIGGER_ACTION_KEY]: "",
    [TRIGGER_LIST_KEY]: [],
    [TRIGGER_RADIUS_KEY]: undefined,
  };
}

/** True when a material assignment is present on the object. */
export function hasMaterialAssignment(meta: Record<string, unknown> | undefined): boolean {
  return typeof meta?.["materialId"] === "string" && (meta["materialId"] as string).length > 0;
}

/** Meta patch that removes material assignment. */
export function clearMaterialAssignmentPatch(): Record<string, unknown> {
  return { materialId: undefined };
}
