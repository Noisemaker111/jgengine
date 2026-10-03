# Truthful device saves

Use `ctx.game.save` for the authoritative world or `createSaveStore` for a caller-owned,
serializable checkpoint. Default offline context saves use strict local storage:
denied reads, quota errors, unavailable storage, and denied removals report
`status() === "error"`. Explicitly injected backends retain their own policy.

For an existing Wayfarer/OddOrbit-style run checkpoint, keep the game's checkpoint
schema and validation, and replace only its persistence adapter:

```ts
import { createSaveStore, localSaveBackend } from "@jgengine/core/game/saveStore";

const checkpoint = createSaveStore({
  key: "my-game:run",
  initial: { roomId: "start", cleared: [] as string[] },
  backend: localSaveBackend(undefined, { errorMode: "throw" }),
  onError: (error) => console.error("Checkpoint storage failed", error),
});

checkpoint.set({ roomId: "harbor", cleared: ["intro"] });
await checkpoint.save();
const message = checkpoint.status() === "saved"
  ? "Checkpoint saved"
  : "Checkpoint could not be saved. Keep playing and retry.";
```

`save()` handles backend rejection; awaiting it alone does not prove success.
Subscribe to status changes for autosave UI. A rejected payload write preserves
the previous stored checkpoint while live edits remain available for retry.
Denied load/remove leaves the current value intact. Whole-world load/hasSave/slot
switches return false after a denied payload read and do not restore cached state. Slot metadata is a separate
storage operation: a payload can be written before its slot index fails. That
reports `error` too; there is no cross-key rollback or transaction guarantee.
Async index updates after load also report through status and `onError`.

`createKeyValueStore` and `localSaveBackend` preserve their legacy silent fallback
by default. Set `errorMode: "throw"` when persistence must succeed; optionally
provide `onError({ operation, key, error })` to observe reads, writes and removals.
Strict key-value writes/removals preserve the prior cell on rejection. Observers
must not throw. Shape validation and corruption recovery still belong to the
game's checkpoint schema or a supplied deserializer.

For intentional session-only/headless success, use `memorySaveBackend()`,
`persist: { storage: "memory" }`, or a key-value cell with `storage: null`.
Memory success does not promise persistence across reloads.
