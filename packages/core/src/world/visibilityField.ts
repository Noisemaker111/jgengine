import type { FogBounds } from "./fog";

/** Numeric code for a cell no group member has seen, or has fully forgotten. */
export const VISIBILITY_HIDDEN = 0;
/** Numeric code for a cell seen before but not currently in view (last-known). */
export const VISIBILITY_REMEMBERED = 1;
/** Numeric code for a cell a group currently observes. */
export const VISIBILITY_OBSERVED = 2;

/** One viewer group's knowledge of a cell: never/forgotten, last-known, or live. */
export type VisibilityState = "hidden" | "remembered" | "observed";

/**
 * How a cell decays after a group stops observing it — the terrain-memory policy.
 * `permanent` keeps last-known terrain forever (RTS explored map); `none` drops
 * it straight back to hidden the moment it leaves view (pure line-of-sight
 * stealth); `decay` remembers it for `updates` observe cycles, then hides it.
 * Day/night, height, sensor, and stealth rules are NOT encoded here — the caller
 * bakes those into which cells it reports as observed each update.
 */
export type VisibilityMemory =
  | { readonly kind: "permanent" }
  | { readonly kind: "none" }
  | { readonly kind: "decay"; readonly updates: number };

/** Construction options for {@link createVisibilityField}. */
export interface VisibilityFieldConfig {
  /** World-space rectangle the grid covers (reused from `world/fog`). */
  readonly bounds: FogBounds;
  /** World units per grid cell. Must be positive. */
  readonly cellSize: number;
  /** Default memory policy applied to every group. Default `{ kind: "permanent" }`. */
  readonly memory?: VisibilityMemory;
  /** Rehydrate from a previously serialized field (see {@link VisibilityField.toState}). */
  readonly restore?: VisibilityFieldState;
}

/**
 * The cells that changed state for one group in a single {@link VisibilityField.observe}
 * call — a pure incremental readout for rendering, minimaps, AI, UI, and
 * authoritative replication. Never lists unchanged cells, so it stays bounded by
 * how much the group's view actually moved.
 */
export interface VisibilityDelta {
  readonly group: string;
  /** Cells that entered observation this update. */
  readonly observed: readonly number[];
  /** Cells that left observation into remembered (last-known) state. */
  readonly remembered: readonly number[];
  /** Cells that fell out of memory entirely (decay expiry or `none` policy). */
  readonly hidden: readonly number[];
}

/** Sparse serialized knowledge for one group — only non-hidden cells are stored. */
export interface VisibilityGroupState {
  /** Currently observed cell indices. */
  readonly observed: readonly number[];
  /** Remembered cells as `[cellIndex, lastObservedTick]` pairs. */
  readonly remembered: readonly (readonly [number, number])[];
  /** Monotonic update counter, used to age remembered cells under a decay policy. */
  readonly tick: number;
  /** Per-group memory override, when it differs from the field default. */
  readonly memory?: VisibilityMemory;
}

/** Serializable snapshot of a whole field — JSON round-trips losslessly. */
export interface VisibilityFieldState {
  readonly cols: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cellSize: number;
  readonly memory: VisibilityMemory;
  readonly groups: Readonly<Record<string, VisibilityGroupState>>;
}

/** Dense per-cell readout for one group, shaped for minimap/overlay drawing. */
export interface VisibilityCells {
  readonly cols: number;
  readonly rows: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cellSize: number;
  /** Row-major `VISIBILITY_*` codes; index = row * cols + col. */
  readonly codes: Uint8Array;
}

/**
 * A gameplay (fog-of-war) knowledge field: per viewer group, every grid cell is
 * hidden, remembered, or observed. Distinct from render culling in
 * `core/visibility` — this models what a team KNOWS, not what a camera can draw.
 * It generalizes `world/fog`'s single-group reveal-once model to many groups
 * with configurable terrain memory, and keeps each group's knowledge isolated so
 * one group's hidden state can never be derived from another's.
 */
export interface VisibilityField {
  readonly cols: number;
  readonly rows: number;
  cellCount(): number;
  colOf(x: number): number;
  rowOf(z: number): number;
  /** Row-major cell index for a world point, clamped into the grid. */
  cellIndex(x: number, z: number): number;

  /** Register a viewer group, optionally with its own memory policy. Idempotent. */
  ensureGroup(group: string, memory?: VisibilityMemory): void;
  hasGroup(group: string): boolean;
  groups(): string[];
  /** Forget everything for a group and drop it. */
  removeGroup(group: string): void;

  /**
   * Cell indices whose centers fall within `radius` of a world point (bounded
   * disc), appended into `out` when supplied. Feed these into {@link observe};
   * union several sources' discs before observing to model overlapping observers.
   */
  cellsInRadius(x: number, z: number, radius: number, out?: number[]): number[];

  /**
   * Replace a group's observed set for this update. Cells newly covered become
   * observed; cells that dropped out become remembered (or hidden under `none`);
   * decayed memory expires. Work is bounded by the observed + remembered working
   * sets — it never scans the whole grid. Returns the resulting {@link VisibilityDelta}.
   */
  observe(group: string, cells: Iterable<number>): VisibilityDelta;
  /** Convenience {@link observe} over a single disc around a source. */
  observeCircle(group: string, x: number, z: number, radius: number): VisibilityDelta;

  stateAtCell(group: string, cell: number): VisibilityState;
  stateAt(group: string, x: number, z: number): VisibilityState;
  isObserved(group: string, x: number, z: number): boolean;
  isRemembered(group: string, x: number, z: number): boolean;
  /** Terrain disclosure: observed OR remembered (anything the group has ever mapped). */
  isKnown(group: string, x: number, z: number): boolean;

  observedCount(group: string): number;
  knownCount(group: string): number;

  /**
   * Authoritative entity-disclosure filter: keep only entities standing in a cell
   * the group currently OBSERVES. Remembered and hidden cells never disclose live
   * entities, so a unit that moved away or was destroyed re-hides. Reads only this
   * group's state, so it is the seam that stops one group's hidden entities from
   * leaking into another group's replicated view.
   */
  visibleTo<T>(
    group: string,
    entities: readonly T[],
    positionOf: (entity: T) => { readonly x: number; readonly z: number },
  ): T[];

  /** Dense per-cell codes for a group, for minimap/overlay rendering. */
  cells(group: string): VisibilityCells;
  /** Sparse serializable snapshot; round-trips through {@link createVisibilityField}'s `restore`. */
  toState(): VisibilityFieldState;
  /** Forget one group's knowledge, or every group when `group` is omitted. */
  reset(group?: string): void;
}

interface GroupData {
  codes: Uint8Array;
  observed: Set<number>;
  remembered: Map<number, number>;
  tick: number;
  memory: VisibilityMemory;
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.floor(value);
  return rounded < min ? min : rounded > max ? max : rounded;
}

function stateOf(code: number): VisibilityState {
  return code === VISIBILITY_OBSERVED
    ? "observed"
    : code === VISIBILITY_REMEMBERED
      ? "remembered"
      : "hidden";
}

/**
 * Build a per-group gameplay visibility field. First adopters: an RTS/stealth
 * team whose scout observes terrain (which stays remembered after it leaves)
 * while enemy units re-hide once no scout observes their cell, and any
 * authoritative host that must filter hidden entities out of a client's replica.
 *
 * @capability visibility-field per-viewer-group observed/remembered/hidden fog-of-war knowledge with terrain memory and authoritative entity disclosure
 */
export function createVisibilityField(config: VisibilityFieldConfig): VisibilityField {
  const cellSize = config.cellSize;
  if (cellSize <= 0) throw new Error("createVisibilityField: cellSize must be positive");

  const restore = config.restore;
  const minX = restore?.minX ?? config.bounds.minX;
  const minZ = restore?.minZ ?? config.bounds.minZ;
  const cols =
    restore?.cols ?? Math.max(1, Math.ceil((config.bounds.maxX - config.bounds.minX) / cellSize));
  const rows =
    restore?.rows ?? Math.max(1, Math.ceil((config.bounds.maxZ - config.bounds.minZ) / cellSize));
  const total = cols * rows;
  const defaultMemory: VisibilityMemory = restore?.memory ?? config.memory ?? { kind: "permanent" };

  const groups = new Map<string, GroupData>();

  function makeGroup(memory: VisibilityMemory): GroupData {
    return {
      codes: new Uint8Array(total),
      observed: new Set<number>(),
      remembered: new Map<number, number>(),
      tick: 0,
      memory,
    };
  }

  function getGroup(group: string): GroupData {
    let data = groups.get(group);
    if (data === undefined) {
      data = makeGroup(defaultMemory);
      groups.set(group, data);
    }
    return data;
  }

  if (restore !== undefined) {
    for (const [name, state] of Object.entries(restore.groups)) {
      const data = makeGroup(state.memory ?? defaultMemory);
      data.tick = state.tick;
      for (const cell of state.observed) {
        if (cell >= 0 && cell < total) {
          data.codes[cell] = VISIBILITY_OBSERVED;
          data.observed.add(cell);
        }
      }
      for (const [cell, tick] of state.remembered) {
        if (cell >= 0 && cell < total && data.codes[cell] === VISIBILITY_HIDDEN) {
          data.codes[cell] = VISIBILITY_REMEMBERED;
          data.remembered.set(cell, tick);
        }
      }
      groups.set(name, data);
    }
  }

  function colOf(x: number): number {
    return clampInt((x - minX) / cellSize, 0, cols - 1);
  }
  function rowOf(z: number): number {
    return clampInt((z - minZ) / cellSize, 0, rows - 1);
  }
  function cellIndex(x: number, z: number): number {
    return rowOf(z) * cols + colOf(x);
  }

  function cellsInRadius(x: number, z: number, radius: number, out: number[] = []): number[] {
    const centerCol = colOf(x);
    const centerRow = rowOf(z);
    if (radius <= 0) {
      out.push(centerRow * cols + centerCol);
      return out;
    }
    const span = Math.ceil(radius / cellSize);
    const radiusSq = radius * radius;
    for (let dr = -span; dr <= span; dr += 1) {
      const row = centerRow + dr;
      if (row < 0 || row >= rows) continue;
      for (let dc = -span; dc <= span; dc += 1) {
        const col = centerCol + dc;
        if (col < 0 || col >= cols) continue;
        const cellX = minX + (col + 0.5) * cellSize;
        const cellZ = minZ + (row + 0.5) * cellSize;
        const dx = cellX - x;
        const dz = cellZ - z;
        if (dx * dx + dz * dz > radiusSq) continue;
        out.push(row * cols + col);
      }
    }
    return out;
  }

  function observe(group: string, cells: Iterable<number>): VisibilityDelta {
    const data = getGroup(group);
    data.tick += 1;
    const now = data.tick;
    const remembering = data.memory.kind !== "none";

    const next = new Set<number>();
    const observedDelta: number[] = [];
    for (const cell of cells) {
      if (cell < 0 || cell >= total || next.has(cell)) continue;
      next.add(cell);
      if (data.codes[cell] !== VISIBILITY_OBSERVED) {
        data.codes[cell] = VISIBILITY_OBSERVED;
        data.remembered.delete(cell);
        observedDelta.push(cell);
      }
    }

    const rememberedDelta: number[] = [];
    const hiddenDelta: number[] = [];
    for (const cell of data.observed) {
      if (next.has(cell)) continue;
      if (remembering) {
        data.codes[cell] = VISIBILITY_REMEMBERED;
        data.remembered.set(cell, now);
        rememberedDelta.push(cell);
      } else {
        data.codes[cell] = VISIBILITY_HIDDEN;
        hiddenDelta.push(cell);
      }
    }
    data.observed = next;

    if (data.memory.kind === "decay") {
      const maxAge = data.memory.updates;
      for (const [cell, seen] of data.remembered) {
        if (now - seen >= maxAge) {
          data.codes[cell] = VISIBILITY_HIDDEN;
          data.remembered.delete(cell);
          hiddenDelta.push(cell);
        }
      }
    }

    return { group, observed: observedDelta, remembered: rememberedDelta, hidden: hiddenDelta };
  }

  return {
    cols,
    rows,
    cellCount() {
      return total;
    },
    colOf,
    rowOf,
    cellIndex,
    ensureGroup(group, memory) {
      const existing = groups.get(group);
      if (existing === undefined) {
        groups.set(group, makeGroup(memory ?? defaultMemory));
      } else if (memory !== undefined) {
        existing.memory = memory;
      }
    },
    hasGroup(group) {
      return groups.has(group);
    },
    groups() {
      return Array.from(groups.keys());
    },
    removeGroup(group) {
      groups.delete(group);
    },
    cellsInRadius,
    observe,
    observeCircle(group, x, z, radius) {
      return observe(group, cellsInRadius(x, z, radius));
    },
    stateAtCell(group, cell) {
      const data = groups.get(group);
      if (data === undefined || cell < 0 || cell >= total) return "hidden";
      return stateOf(data.codes[cell]!);
    },
    stateAt(group, x, z) {
      const data = groups.get(group);
      if (data === undefined) return "hidden";
      return stateOf(data.codes[cellIndex(x, z)]!);
    },
    isObserved(group, x, z) {
      const data = groups.get(group);
      return data !== undefined && data.codes[cellIndex(x, z)] === VISIBILITY_OBSERVED;
    },
    isRemembered(group, x, z) {
      const data = groups.get(group);
      return data !== undefined && data.codes[cellIndex(x, z)] === VISIBILITY_REMEMBERED;
    },
    isKnown(group, x, z) {
      const data = groups.get(group);
      return data !== undefined && data.codes[cellIndex(x, z)] !== VISIBILITY_HIDDEN;
    },
    observedCount(group) {
      return groups.get(group)?.observed.size ?? 0;
    },
    knownCount(group) {
      const data = groups.get(group);
      if (data === undefined) return 0;
      return data.observed.size + data.remembered.size;
    },
    visibleTo(group, entities, positionOf) {
      const data = groups.get(group);
      if (data === undefined) return [];
      const result: typeof entities[number][] = [];
      for (const entity of entities) {
        const position = positionOf(entity);
        if (data.codes[cellIndex(position.x, position.z)] === VISIBILITY_OBSERVED) {
          result.push(entity);
        }
      }
      return result;
    },
    cells(group) {
      const data = groups.get(group);
      const codes = data === undefined ? new Uint8Array(total) : data.codes.slice();
      return { cols, rows, minX, minZ, cellSize, codes };
    },
    toState() {
      const out: Record<string, VisibilityGroupState> = {};
      for (const [name, data] of groups) {
        const remembered: [number, number][] = Array.from(data.remembered.entries()).sort(
          (a, b) => a[0] - b[0],
        );
        out[name] = {
          observed: Array.from(data.observed).sort((a, b) => a - b),
          remembered,
          tick: data.tick,
          memory: data.memory,
        };
      }
      return { cols, rows, minX, minZ, cellSize, memory: defaultMemory, groups: out };
    },
    reset(group) {
      if (group === undefined) {
        for (const data of groups.values()) {
          data.codes.fill(VISIBILITY_HIDDEN);
          data.observed.clear();
          data.remembered.clear();
          data.tick = 0;
        }
        return;
      }
      const data = groups.get(group);
      if (data === undefined) return;
      data.codes.fill(VISIBILITY_HIDDEN);
      data.observed.clear();
      data.remembered.clear();
      data.tick = 0;
    },
  };
}
