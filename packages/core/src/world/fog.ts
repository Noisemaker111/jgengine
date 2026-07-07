export interface FogBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface FogConfig {
  bounds: FogBounds;
  cellSize: number;
  /** Cells revealed on construction (start-of-run known area). */
  revealed?: readonly number[];
}

export interface FogCells {
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  cellSize: number;
  /** Row-major flags; index = row * cols + col. */
  revealed: readonly boolean[];
  revealedCount: number;
}

/**
 * Reveal-on-event fog of war over a fixed grid. Walking (`revealAlong`) and
 * digging/acting (`reveal`) clear cells; once revealed a cell stays revealed.
 * Pure and renderer-free — the shell/react map draws `cells()`.
 */
export interface FogField {
  reveal(x: number, z: number, radius?: number): number;
  revealAlong(
    from: readonly [number, number],
    to: readonly [number, number],
    radius?: number,
  ): number;
  isRevealed(x: number, z: number): boolean;
  isRevealedCell(col: number, row: number): boolean;
  revealedCount(): number;
  cellCount(): number;
  fraction(): number;
  cells(): FogCells;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.floor(value);
  return rounded < min ? min : rounded > max ? max : rounded;
}

export function createFogField(config: FogConfig): FogField {
  const { minX, minZ, maxX, maxZ } = config.bounds;
  const cellSize = config.cellSize;
  if (cellSize <= 0) throw new Error("createFogField: cellSize must be positive");
  const cols = Math.max(1, Math.ceil((maxX - minX) / cellSize));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cellSize));
  const total = cols * rows;
  const revealed = new Array<boolean>(total).fill(false);
  let revealedCount = 0;
  const listeners = new Set<() => void>();
  let snapshotCache: FogCells | null = null;

  function colOf(x: number): number {
    return clampInt((x - minX) / cellSize, 0, cols - 1);
  }
  function rowOf(z: number): number {
    return clampInt((z - minZ) / cellSize, 0, rows - 1);
  }

  function markCell(col: number, row: number): boolean {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
    const index = row * cols + col;
    if (revealed[index]) return false;
    revealed[index] = true;
    revealedCount += 1;
    return true;
  }

  function notify(changed: number): void {
    if (changed === 0) return;
    snapshotCache = null;
    for (const listener of listeners) listener();
  }

  function revealAt(x: number, z: number, radius: number): number {
    const centerCol = colOf(x);
    const centerRow = rowOf(z);
    let changed = markCell(centerCol, centerRow) ? 1 : 0;
    if (radius <= 0) return changed;
    const span = Math.ceil(radius / cellSize);
    const radiusSq = radius * radius;
    for (let dr = -span; dr <= span; dr += 1) {
      for (let dc = -span; dc <= span; dc += 1) {
        if (dc === 0 && dr === 0) continue;
        const cellX = minX + (centerCol + dc + 0.5) * cellSize;
        const cellZ = minZ + (centerRow + dr + 0.5) * cellSize;
        const dx = cellX - x;
        const dz = cellZ - z;
        if (dx * dx + dz * dz > radiusSq) continue;
        if (markCell(centerCol + dc, centerRow + dr)) changed += 1;
      }
    }
    return changed;
  }

  if (config.revealed !== undefined) {
    for (const index of config.revealed) {
      if (index >= 0 && index < total && !revealed[index]) {
        revealed[index] = true;
        revealedCount += 1;
      }
    }
    snapshotCache = null;
  }

  return {
    reveal(x, z, radius = 0) {
      const changed = revealAt(x, z, radius);
      notify(changed);
      return changed;
    },
    revealAlong(from, to, radius = cellSize) {
      const dx = to[0] - from[0];
      const dz = to[1] - from[1];
      const distance = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.ceil(distance / cellSize));
      let changed = 0;
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        changed += revealAt(from[0] + dx * t, from[1] + dz * t, radius);
      }
      notify(changed);
      return changed;
    },
    isRevealed(x, z) {
      return revealed[rowOf(z) * cols + colOf(x)] === true;
    },
    isRevealedCell(col, row) {
      if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
      return revealed[row * cols + col] === true;
    },
    revealedCount() {
      return revealedCount;
    },
    cellCount() {
      return total;
    },
    fraction() {
      return total === 0 ? 0 : revealedCount / total;
    },
    cells() {
      if (snapshotCache === null) {
        snapshotCache = {
          cols,
          rows,
          minX,
          minZ,
          cellSize,
          revealed: revealed.slice(),
          revealedCount,
        };
      }
      return snapshotCache;
    },
    reset() {
      if (revealedCount === 0) return;
      revealed.fill(false);
      revealedCount = 0;
      notify(1);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
