import { createToastQueue, type ToastQueue } from "@jgengine/core/game/toasts";
import {
  createAuthoredTriggerRuntime,
  getTriggerAction,
  listTriggerActions,
  registerBuiltinTriggerActions,
  type AuthoredTriggerRuntime,
  type TriggerDispatchEvent,
} from "@jgengine/core/scene/authoredTriggers";
import { collectAuthoredTriggers, type GameContext } from "@jgengine/shell/gameKit";

import { editorLayers } from "../editorLayers";

// First adopter of the shared primitive: the `announce` action (plus `win`/`advance`) is engine-owned
// now, so the showcase just registers the built-ins and supplies a handler — no bespoke action schema.
registerBuiltinTriggerActions();

export type Announcement = {
  message: string;
  tone: string;
  at: number;
};

// Single-slot announcement store on top of the shared toast-feed primitive. `cap: 1` gives the same
// replace-on-next-announce behavior the hand-rolled `lastAnnouncement` variable had; unlike a HUD toast,
// an announcement never self-expires here (no `prune()` call anywhere), so pushes use an infinite TTL.
const announcementQueue: ToastQueue<Announcement> = createToastQueue<Announcement>({ cap: 1 });

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
        const at = Date.now();
        announcementQueue.push(
          { message: String(event.params.message ?? "Entered zone"), tone: String(event.params.tone ?? "info"), at },
          at,
          Number.POSITIVE_INFINITY,
        );
        notify();
      },
    },
  });
  return runtime;
}

/** Latest announce dispatch for the HUD readout. */
export function currentAnnouncement(): Announcement | null {
  return announcementQueue.list()[0]?.body ?? null;
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
