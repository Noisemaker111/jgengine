/**
 * The replication seam for host-authoritative shared worlds: the opt-in feature manifest *is* the
 * replication schema. Each live subsystem a game opts into registers a {@link SnapshotModule} keyed
 * by name; the host serializes exactly the registered set into a {@link WorldSnapshot} and a client
 * hydrates the same keys back. Adding a replicated subsystem is a registration, never a new branch.
 */
export interface SnapshotModule<T = unknown> {
  readonly key: string;
  snapshot(): T;
  hydrate(data: T): void;
}

/** Full world baseline keyed by {@link SnapshotModule.key} — one entry per opted-in subsystem. */
export type WorldSnapshot = Record<string, unknown>;

/** Serialize every registered module into one keyed baseline — the host→client full-world send. */
export function composeWorldSnapshot(modules: readonly SnapshotModule[]): WorldSnapshot {
  const snapshot: WorldSnapshot = {};
  for (const module of modules) snapshot[module.key] = module.snapshot();
  return snapshot;
}

/** Hydrate every registered module whose key is present in `snapshot`; keys absent from it are left untouched. */
export function applyWorldSnapshot(
  modules: readonly SnapshotModule[],
  snapshot: WorldSnapshot,
): void {
  for (const module of modules) {
    if (Object.prototype.hasOwnProperty.call(snapshot, module.key)) {
      module.hydrate(snapshot[module.key]);
    }
  }
}
