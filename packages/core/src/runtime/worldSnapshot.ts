/** Who a host→client snapshot is being projected for — the identity a {@link SnapshotModule.project} filters against. */
export interface SnapshotViewer {
  readonly userId: string;
}

/**
 * The replication seam for host-authoritative shared worlds: the opt-in feature manifest *is* the
 * replication schema. Each live subsystem a game opts into registers a {@link SnapshotModule} keyed
 * by name; the host serializes exactly the registered set into a {@link WorldSnapshot} and a client
 * hydrates the same keys back. Adding a replicated subsystem is a registration, never a new branch.
 *
 * Two optional members carry per-viewer projection and change detection *through the same contract*,
 * so a feature opts into either without the engine growing a per-feature branch:
 * - {@link project} narrows this module's snapshot to what one viewer may see (private state, area of
 *   interest). Absent → the module is world-public and every client receives it verbatim (the default).
 * - {@link version} is a monotone counter the host reads to skip re-serializing an unchanged module.
 * - {@link decode} validates/coerces wire `unknown` into `T` before hydrate; returning `null` skips
 *   that module (fail-soft) instead of poisoning live state with a bare cast.
 */
export interface SnapshotModule<T = unknown> {
  readonly key: string;
  snapshot(): T;
  hydrate(data: T): void;
  /**
   * Optional wire codec: turn the raw snapshot value into a typed `T`, or `null` to skip this module.
   * When present, {@link applyWorldSnapshot} runs it before {@link hydrate} and never calls hydrate on
   * a failed decode — a bad host/client payload leaves the prior module state intact rather than
   * throwing or applying garbage.
   */
  decode?(raw: unknown): T | null;
  /**
   * Narrow this module's full snapshot to what `viewer` is allowed to see — return the same shape
   * carrying only the visible subset (drop other players' private state, cull entities outside the
   * viewer's area of interest). `world` is the whole unprojected baseline, so a module can cross-
   * reference another (e.g. drop stats for entities the viewer can't see). Absent → world-public: the
   * full value is sent to every viewer.
   */
  project?(data: T, viewer: SnapshotViewer, world: WorldSnapshot): T;
  /** Monotone change counter; unchanged between host commits means this module didn't mutate and need not re-serialize. */
  version?(): number;
}

/** Full world baseline keyed by {@link SnapshotModule.key} — one entry per opted-in subsystem. */
export type WorldSnapshot = Record<string, unknown>;

/**
 * Serialize every registered module into one keyed baseline — the host→client full-world send. When a
 * `viewer` is supplied, each module that implements {@link SnapshotModule.project} narrows its value to
 * what that viewer may see; modules without a projector are sent verbatim.
 * @internal
 */
export function composeWorldSnapshot(
  modules: readonly SnapshotModule[],
  viewer?: SnapshotViewer,
): WorldSnapshot {
  const raw: WorldSnapshot = {};
  for (const module of modules) raw[module.key] = module.snapshot();
  if (viewer === undefined) return raw;
  const snapshot: WorldSnapshot = {};
  for (const module of modules) {
    const value = raw[module.key];
    snapshot[module.key] =
      module.project !== undefined ? module.project(value, viewer, raw) : value;
  }
  return snapshot;
}

/**
 * Hydrate every registered module whose key is present in `snapshot`; keys absent from it are left
 * untouched. When a module provides {@link SnapshotModule.decode}, a `null` decode skips that module
 * (fail-soft) instead of calling hydrate with unvalidated wire data.
 * @internal
 */
export function applyWorldSnapshot(
  modules: readonly SnapshotModule[],
  snapshot: WorldSnapshot,
): void {
  for (const module of modules) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, module.key)) continue;
    const raw = snapshot[module.key];
    if (module.decode !== undefined) {
      const decoded = module.decode(raw);
      if (decoded === null) continue;
      module.hydrate(decoded);
    } else {
      module.hydrate(raw);
    }
  }
}
