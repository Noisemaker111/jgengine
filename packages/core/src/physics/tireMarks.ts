/** One laid stretch of rubber: a dark strip from `a` to `b` on the ground at height `y`. */
export interface TireMark {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number;
  /** Strip width, m. */
  width: number;
  /** Darkness `0..1` when laid; it fades out over the store's `lifetime`. */
  strength: number;
  /** Game time it was laid, s. */
  born: number;
}

/** Serializable {@link TireMarks} contents. */
export interface TireMarksState {
  marks: TireMark[];
}

/**
 * Skid marks for every car in a game: wheels press rubber onto the ground while they slide, and old marks
 * fade and recycle from a fixed pool, so a long drift session never grows memory. Cars feed it through
 * `tickDrivableVehicle`'s `tires` option; the shell draws whatever is in `ctx.tireMarks`.
 */
export interface TireMarks {
  /**
   * Lay rubber under wheel `key` (a car id plus a wheel index) from where it last pressed to `[x, y, z]`.
   * The first press after a lift only records the point; a jump of more than 3 m starts a fresh strip.
   */
  press(key: string, x: number, y: number, z: number, strength: number, width: number, time: number): void;
  /** The wheel stopped sliding: its next press starts a new strip. */
  lift(key: string): void;
  /** Marks still visible at `time`, oldest first. */
  marks(time: number): readonly TireMark[];
  /** Bumps whenever a mark is laid or the store is cleared, so a renderer rebuilds only on change. */
  version(): number;
  /** Seconds a mark takes to fade out. */
  readonly lifetime: number;
  readonly capacity: number;
  snapshot(): TireMarksState;
  restore(state: TireMarksState): void;
  reset(): void;
}

/** Shortest strip worth laying, m: shorter presses wait and join the next one. */
const MIN_SEGMENT = 0.25;
const MAX_GAP = 3;

/**
 * Creates a {@link TireMarks} pool.
 * @capability tire-marks skid marks laid by sliding wheels that fade over time from a fixed pool
 */
export function createTireMarks(options: { capacity?: number; lifetime?: number } = {}): TireMarks {
  const capacity = Math.max(16, Math.floor(options.capacity ?? 1500));
  const lifetime = Math.max(1, options.lifetime ?? 24);
  let ring: TireMark[] = [];
  let head = 0;
  let version = 0;
  const last = new Map<string, readonly [number, number, number]>();

  function push(mark: TireMark): void {
    if (ring.length < capacity) ring.push(mark);
    else {
      ring[head] = mark;
      head = (head + 1) % capacity;
    }
    version += 1;
  }

  function ordered(): TireMark[] {
    return ring.length < capacity ? ring.slice() : [...ring.slice(head), ...ring.slice(0, head)];
  }

  return {
    lifetime,
    capacity,
    press(key, x, y, z, strength, width, time) {
      const from = last.get(key);
      if (from === undefined) {
        last.set(key, [x, y, z]);
        return;
      }
      const length = Math.hypot(x - from[0], z - from[2]);
      if (length > MAX_GAP) {
        last.set(key, [x, y, z]);
        return;
      }
      if (length < MIN_SEGMENT) return;
      push({ ax: from[0], az: from[2], bx: x, bz: z, y: Math.max(from[1], y), width, strength: Math.max(0, Math.min(1, strength)), born: time });
      last.set(key, [x, y, z]);
    },
    lift(key) {
      last.delete(key);
    },
    marks(time) {
      return ordered().filter((mark) => time - mark.born < lifetime);
    },
    version: () => version,
    snapshot: () => ({ marks: ordered().map((mark) => ({ ...mark })) }),
    restore(state) {
      ring = state.marks.slice(-capacity).map((mark) => ({ ...mark }));
      head = 0;
      last.clear();
      version += 1;
    },
    reset() {
      ring = [];
      head = 0;
      last.clear();
      version += 1;
    },
  };
}
