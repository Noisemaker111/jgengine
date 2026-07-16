import {
  collectAuthoredTriggers,
  createAuthoredTriggerRuntime,
  getTriggerAction,
  listTriggerActions,
  registerTriggerAction,
  type AuthoredTriggerRuntime,
  type TriggerDispatchEvent,
} from "@jgengine/core/scene/authoredTriggers";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { editorLayers } from "../editorLayers";

/**
 * Showcase action — "when player enters this volume, announce a message". Params are schema'd so
 * the editor inspector renders message + tone fields without custom JSX.
 */
registerTriggerAction({
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
});

export type Announcement = {
  message: string;
  tone: string;
  at: number;
};

let lastAnnouncement: Announcement | null = null;
let runtime: AuthoredTriggerRuntime | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function ensureRuntime(): AuthoredTriggerRuntime {
  if (runtime !== null) return runtime;
  const triggers = collectAuthoredTriggers(editorLayers).filter((trigger) => getTriggerAction(trigger.action) !== undefined);
  if (listTriggerActions().length === 0 && triggers.length > 0) {
    // registration should already have run; empty list means the game forgot to declare actions
  }
  runtime = createAuthoredTriggerRuntime({
    document: editorLayers,
    triggers,
    handlers: {
      announce: (event: TriggerDispatchEvent) => {
        lastAnnouncement = {
          message: String(event.params.message ?? "Entered zone"),
          tone: String(event.params.tone ?? "info"),
          at: Date.now(),
        };
        notify();
      },
    },
  });
  return runtime;
}

/** Latest announce dispatch for the HUD readout. */
export function currentAnnouncement(): Announcement | null {
  return lastAnnouncement;
}

/** Subscribe to announcement changes — use with `useSyncExternalStore`. */
export function subscribeAnnouncement(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Watch authored triggers against the local player; call from onTick. */
export function tickAuthoredTriggers(ctx: GameContext): void {
  const entity = ctx.scene.entity.get(ctx.player.userId);
  if (entity === null) return;
  const interact = ctx.input.justPressed("interact") ? [ctx.player.userId] : [];
  ensureRuntime().step({
    actors: [{ id: ctx.player.userId, position: entity.position }],
    interact,
  });
}
