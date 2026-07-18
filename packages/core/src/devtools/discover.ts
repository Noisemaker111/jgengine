import type { ChangeSignal } from "../store/changeSignal";
import {
  MAX_SCAN_DEPTH,
  MAX_SCAN_TARGETS,
  MAX_TABLE_ENTRIES,
  cloneValue,
  discoverableKind,
  isScannableContainer,
  joinTunablePath,
  ownWritableDataKeys,
  type DevtoolsControlKind,
  type DiscoverySkip,
  type ScanMeta,
  type TunableOptions,
} from "./tunableSchema";
import { formatLogArg } from "./logs";
import type { ControlRecord } from "./controls";
import type { Devtools, DiscoveredEntry, Tunable, TunableAccessor } from "./types";

export interface DiscoveredRecord {
  id: string;
  table: string;
  key: string;
  kind: DevtoolsControlKind;
  initial: unknown;
  enabled: boolean;
  source: object | null;
  options?: TunableOptions;
  get(): unknown;
  set(value: unknown): void;
}

interface ScanTarget {
  path: string;
  target: Record<string, unknown>;
  key: string;
  kind: DevtoolsControlKind;
  options?: TunableOptions;
}

interface ScanCollection {
  targets: ScanTarget[];
  skipped: DiscoverySkip[];
}

function collectScanTargets(root: unknown, meta?: ScanMeta): ScanCollection {
  const skipped: DiscoverySkip[] = [];
  if (!isScannableContainer(root)) {
    if (root !== null && typeof root === "object") {
      skipped.push({ path: "", reason: "not a plain object or array" });
    }
    return { targets: [], skipped };
  }
  const out: ScanTarget[] = [];
  const visited = new Set<object>([root]);
  let frontier: { path: string; target: Record<string, unknown> }[] = [{ path: "", target: root }];
  for (let depth = 0; depth <= MAX_SCAN_DEPTH && frontier.length > 0; depth += 1) {
    const next: typeof frontier = [];
    for (const { path, target } of frontier) {
      const keys = ownWritableDataKeys(target);
      let scalarCount = 0;
      for (const key of keys) {
        const value = target[key];
        const childPath = joinTunablePath(path, key);
        const fieldMeta = meta?.[childPath];
        const kind = discoverableKind(value, fieldMeta);
        if (kind !== null) {
          scalarCount += 1;
          if (scalarCount > MAX_TABLE_ENTRIES) {
            skipped.push({ path: path === "" ? "*" : path, reason: `more than ${MAX_TABLE_ENTRIES} scalar entries` });
            scalarCount = -1;
            break;
          }
        }
      }
      if (scalarCount < 0) continue;
      for (const key of keys) {
        const value = target[key];
        const childPath = joinTunablePath(path, key);
        const fieldMeta = meta?.[childPath];
        const kind = discoverableKind(value, fieldMeta);
        if (kind !== null) {
          if (out.length >= MAX_SCAN_TARGETS) {
            skipped.push({ path: childPath, reason: `scan cap ${MAX_SCAN_TARGETS}` });
            return { targets: out, skipped };
          }
          out.push({ path: childPath, target, key, kind, options: fieldMeta });
          continue;
        }
        if (value !== null && typeof value === "object") {
          if (!isScannableContainer(value)) {
            skipped.push({ path: childPath, reason: "unsupported structure" });
            continue;
          }
          if (visited.has(value)) {
            skipped.push({ path: childPath, reason: "cycle" });
            continue;
          }
          if (depth === MAX_SCAN_DEPTH) {
            skipped.push({ path: childPath, reason: `depth > ${MAX_SCAN_DEPTH}` });
            continue;
          }
          visited.add(value);
          next.push({ path: childPath, target: value });
        }
      }
    }
    frontier = next;
  }
  return { targets: out, skipped };
}

export interface DiscoverModule {
  discover: Devtools["discover"];
  probes: Devtools["probes"];
  readProbes: () => Record<string, unknown>;
  enableDiscovered: (id: string) => void;
  discoveredRecords: Map<string, DiscoveredRecord>;
  getDiscoverySkips: () => readonly DiscoverySkip[];
}

export const createDiscoverModule = (deps: {
  signal: ChangeSignal;
  register: <T>(name: string, initial: T, options?: TunableOptions<T>) => Tunable<T>;
  controlRecords: Map<string, ControlRecord>;
}): DiscoverModule => {
  const { signal, register, controlRecords } = deps;

  const discoveredRecords = new Map<string, DiscoveredRecord>();
  const probeReaders = new Map<string, () => unknown>();
  let boundProps = new WeakMap<object, Set<string>>();
  let discoverySkips: DiscoverySkip[] = [];

  const readProbes = (): Record<string, unknown> => {
    const values: Record<string, unknown> = {};
    for (const [name, read] of probeReaders) {
      try {
        values[name] = read();
      } catch (error) {
        values[name] = `probe failed: ${formatLogArg(error)}`;
      }
    }
    return values;
  };

  const bindDiscovered = (
    table: string,
    key: string,
    kind: DevtoolsControlKind,
    accessor: TunableAccessor,
    source: object | null,
    options?: TunableOptions,
  ): boolean => {
    const id = `${table}/${key}`;
    const existing = discoveredRecords.get(id);
    if (existing === undefined) {
      discoveredRecords.set(id, {
        id,
        table,
        key,
        kind,
        initial: cloneValue(accessor.initial),
        enabled: false,
        source,
        options,
        get: accessor.get,
        set: accessor.set,
      });
      return true;
    }
    if (source !== null && existing.source === source) return false;
    existing.source = source;
    existing.get = accessor.get;
    existing.set = accessor.set;
    existing.kind = kind;
    existing.options = options ?? existing.options;
    const control = controlRecords.get(id);
    if (existing.enabled && control !== undefined) accessor.set(cloneValue(control.value));
    return true;
  };

  const scanTable = (table: string, candidate: unknown, meta?: ScanMeta): number => {
    const { targets, skipped } = collectScanTargets(candidate, meta);
    discoverySkips = [
      ...discoverySkips.filter((entry) => entry.path !== table && !entry.path.startsWith(`${table}/`)),
      ...skipped.map((entry) => ({
        path: entry.path === "" ? table : `${table}/${entry.path}`,
        reason: entry.reason,
      })),
    ];
    if (targets.length === 0) return 0;
    let changed = false;
    let bound = 0;
    for (const { path, target, key, kind, options } of targets) {
      const boundKeys = boundProps.get(target);
      if (boundKeys?.has(key) === true && !discoveredRecords.has(`${table}/${path}`)) continue;
      const accessor: TunableAccessor = {
        initial: cloneValue(target[key]),
        get: () => target[key],
        set: (value) => {
          target[key] = value;
        },
      };
      if (bindDiscovered(table, path, kind, accessor, target, options)) changed = true;
      bound += 1;
      if (boundKeys === undefined) boundProps.set(target, new Set([key]));
      else boundKeys.add(key);
    }
    if (changed) signal.notify();
    return bound;
  };

  const enableDiscovered = (id: string): void => {
    const record = discoveredRecords.get(id);
    if (record === undefined || record.enabled) return;
    record.enabled = true;
    const current = record.get();
    const handle = register<unknown>(id, record.initial, {
      ...(record.options ?? {}),
      group: record.options?.group ?? record.table,
      label: record.options?.label ?? record.key,
      kind: record.kind,
    });
    handle.subscribe((value) => record.set(cloneValue(value)));
    if (JSON.stringify(current) !== JSON.stringify(record.initial)) handle.set(current);
  };

  return {
    discover: {
      bind(table, key, accessor, options) {
        const kind = discoverableKind(accessor.initial, options);
        if (kind === null) return;
        if (bindDiscovered(table, key, kind, accessor, null, options)) signal.notify();
      },
      scanTable,
      scanModule(exports, meta) {
        let total = 0;
        for (const [name, value] of Object.entries(exports)) {
          total += scanTable(name, value, meta);
        }
        return total;
      },
      list: (): readonly DiscoveredEntry[] =>
        [...discoveredRecords.values()].map((record) => ({
          id: record.id,
          table: record.table,
          key: record.key,
          kind: record.kind,
          initial: record.initial,
          enabled: record.enabled,
          read: () => record.get(),
        })),
      skipped: () => discoverySkips,
      enable(id) {
        enableDiscovered(id);
        signal.notify();
      },
      disable(id) {
        const record = discoveredRecords.get(id);
        if (record === undefined || !record.enabled) return;
        record.enabled = false;
        record.set(cloneValue(record.initial));
        controlRecords.delete(id);
        signal.notify();
      },
      clear() {
        for (const record of discoveredRecords.values()) {
          if (record.enabled) {
            record.set(cloneValue(record.initial));
            controlRecords.delete(record.id);
          }
        }
        discoveredRecords.clear();
        discoverySkips = [];
        boundProps = new WeakMap();
        signal.notify();
      },
    },
    probes: {
      register(name, read) {
        probeReaders.set(name, read);
        signal.notify();
        return () => {
          probeReaders.delete(name);
          signal.notify();
        };
      },
      read: readProbes,
    },
    readProbes,
    enableDiscovered,
    discoveredRecords,
    getDiscoverySkips: () => discoverySkips,
  };
};
