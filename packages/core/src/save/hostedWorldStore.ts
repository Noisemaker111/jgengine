// @skill jgengine-gameplay
import type { WorldSnapshot } from "../runtime/worldSnapshot";

export interface HostedWorldRecord {
  snapshot: WorldSnapshot;
  revision: number;
}

/**
 * Narrow persistence seam for a hosted world — the {@link HostedWorldRecord} counterpart of `HostPersistence`.
 * Backends implement it (memory/file/sql/convex); the session never names one. A stateful host loads once and
 * saves on a cadence; a stateless host reconstructs from `load()` each invocation.
 */
export interface HostedWorldStore {
  load(): Promise<HostedWorldRecord | null>;
  save(record: HostedWorldRecord): Promise<void>;
}

export interface SyncHostedWorldStore {
  load(): HostedWorldRecord | null;
  save(record: HostedWorldRecord): void | Promise<void>;
}
