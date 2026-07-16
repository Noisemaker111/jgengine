import {
  getTriggerAction,
  listTriggerActions,
  readFlatTrigger,
  TRIGGER_ACTION_KEY,
  TRIGGER_LIST_KEY,
  TRIGGER_ON_KEY,
  TRIGGER_RADIUS_KEY,
  type TriggerEvent,
  type TriggerSourceKind,
} from "@jgengine/core/scene/authoredTriggers";
import { defaultParamMeta, parseParams } from "@jgengine/core/scene/sceneKinds";

import { SchemaInspector, type MetaPatch } from "./SchemaInspector";
import { INPUT, MICRO } from "./chromeStyles";
import { NumberField } from "./chromeFields";

const EVENTS: readonly { value: TriggerEvent | ""; label: string }[] = [
  { value: "", label: "— none —" },
  { value: "enter", label: "On enter" },
  { value: "exit", label: "On exit" },
  { value: "interact", label: "On interact" },
];

/**
 * Inspector block for the authored-trigger vocabulary (`on` / `action` + action params).
 * Renders only when the game has registered at least one action for this target; params come from
 * the declared action's ParamSchema via SchemaInspector.
 * @internal
 */
export function TriggerInspector({
  target,
  meta,
  onMeta,
}: {
  target: TriggerSourceKind;
  meta: Record<string, unknown> | undefined;
  onMeta: MetaPatch;
}) {
  const actions = listTriggerActions(target);
  if (actions.length === 0) return null;

  const flat = readFlatTrigger(meta);
  const multi = Array.isArray(meta?.[TRIGGER_LIST_KEY]);
  const actionDef = flat.action.length > 0 ? getTriggerAction(flat.action) : undefined;
  const allowedEvents = actionDef?.events;
  const eventOptions = EVENTS.filter(
    (entry) => entry.value === "" || allowedEvents === undefined || allowedEvents.includes(entry.value as TriggerEvent),
  );

  const writeTrigger = (on: TriggerEvent | "", action: string) => {
    if (on === "" || action.length === 0) {
      onMeta({ [TRIGGER_ON_KEY]: "", [TRIGGER_ACTION_KEY]: "", [TRIGGER_LIST_KEY]: [] }, "trigger:clear");
      return;
    }
    const patch: Record<string, unknown> = {
      [TRIGGER_ON_KEY]: on,
      [TRIGGER_ACTION_KEY]: action,
      [TRIGGER_LIST_KEY]: [],
    };
    const definition = getTriggerAction(action);
    if (definition !== undefined) {
      const defaults = defaultParamMeta(definition.schema);
      for (const [key, value] of Object.entries(defaults)) {
        if (meta?.[key] === undefined) patch[key] = value;
      }
    }
    onMeta(patch, "trigger:set");
  };

  const onParamMeta: MetaPatch = (patch, coalesce) => {
    onMeta({ ...(meta ?? {}), ...patch }, coalesce);
  };

  return (
    <div className="space-y-2 rounded-lg border border-amber-400/15 bg-amber-500/[0.06] p-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300">Behavior trigger</div>
      {multi ? (
        <div className="text-[10px] text-neutral-400">
          Multi-trigger list on this object — edit via document JSON / RPC. Clear list to use the simple editor.
          <button
            type="button"
            className="mt-1 block rounded-md bg-white/[0.07] px-2 py-1 text-[10px] ring-1 ring-inset ring-white/[0.06] hover:bg-white/15"
            onClick={() => onMeta({ [TRIGGER_LIST_KEY]: [] }, "trigger:unlist")}
          >
            Clear multi-list
          </button>
        </div>
      ) : (
        <>
          <label className="flex items-center justify-between gap-2">
            <span className={MICRO}>on</span>
            <select
              className={`w-36 ${INPUT}`}
              value={flat.on}
              onChange={(event) => {
                const on = event.target.value as TriggerEvent | "";
                if (on === "") writeTrigger("", "");
                else writeTrigger(on, flat.action.length > 0 ? flat.action : (actions[0]?.id ?? ""));
              }}
            >
              {eventOptions.map((entry) => (
                <option key={entry.value || "none"} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className={MICRO}>action</span>
            <select
              className={`w-36 ${INPUT}`}
              value={flat.action}
              disabled={flat.on === ""}
              onChange={(event) => writeTrigger(flat.on === "" ? "enter" : flat.on, event.target.value)}
            >
              <option value="">— choose —</option>
              {actions.map((action) => (
                <option key={action.id} value={action.id}>
                  {action.label}
                </option>
              ))}
            </select>
          </label>
          {target === "marker" && flat.on !== "" ? (
            <NumberField
              label="trigger r"
              step={0.5}
              value={typeof meta?.[TRIGGER_RADIUS_KEY] === "number" ? (meta[TRIGGER_RADIUS_KEY] as number) : typeof meta?.["radius"] === "number" ? (meta["radius"] as number) : 2.5}
              onCommit={(value) => onParamMeta({ [TRIGGER_RADIUS_KEY]: Math.max(0, value) }, "trigger:radius")}
            />
          ) : null}
          {actionDef !== undefined && actionDef.schema.fields.some((field) => field.type !== "action") ? (
            <SchemaInspector
              schema={actionDef.schema}
              label={`${actionDef.label} params`}
              accent="#fbbf24"
              meta={meta}
              onMeta={onParamMeta}
              note={
                flat.on === ""
                  ? undefined
                  : `${flat.on} → ${actionDef.id} (${Object.keys(parseParams(actionDef.schema, meta)).length} params)`
              }
            />
          ) : null}
        </>
      )}
    </div>
  );
}
