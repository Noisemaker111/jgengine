/**
 * Which placements of a unique scatter species draw as their own grown mesh: the nearest few within
 * reach of the camera. Everything else draws as a shared stand-in variant and, far away, its impostor.
 * Hero meshes stay resident after a placement leaves the set, least recently used first out, so walking
 * back and forth regrows nothing.
 *
 * @capability scatter-generator grow a scatter palette item from a seeded generator's baked variants
 */

/** A placement the hero set can pick: its id and ground position. */
export interface ScatterHeroMember {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

/** Options for {@link createScatterHeroSet}. */
export interface ScatterHeroSetOptions {
  /** Most heroes at once. Default 32. */
  heroes?: number;
  /** A placement becomes a hero within this ground distance (m). Default 40. */
  distance?: number;
  /** A hero stays one until this many times `distance`, so the edge does not flicker. Default 1.2. */
  hysteresis?: number;
  /** Most hero meshes kept resident, heroes included. Default twice `heroes`. */
  resident?: number;
}

/** What {@link ScatterHeroSet.update} changed. */
export interface ScatterHeroUpdate {
  /** Current heroes, nearest first. */
  heroes: readonly string[];
  /** Resident meshes to drop: no longer heroes and least recently used past the resident cap. */
  evicted: readonly string[];
  /** True when `heroes` differs from the last update. */
  changed: boolean;
}

/** The hero set's state: current heroes and resident ids, least recently used first. */
export interface ScatterHeroSetState {
  heroes: string[];
  resident: string[];
}

/** A hero set: pick heroes near a camera from placements bucketed on a ground grid. */
export interface ScatterHeroSet {
  /** Replace the placements; current heroes and residents that are gone are evicted on the next update. */
  setMembers(members: readonly ScatterHeroMember[]): void;
  /** Pick heroes around a ground position; reads only the grid cells within reach. */
  update(x: number, z: number): ScatterHeroUpdate;
  state(): ScatterHeroSetState;
  restore(state: ScatterHeroSetState): void;
}

/**
 * A hero set for one species. `update` costs the placements in the few grid cells within reach of the
 * camera, never the whole field.
 * @capability scatter-generator grow a scatter palette item from a seeded generator's baked variants
 */
export function createScatterHeroSet(options: ScatterHeroSetOptions = {}): ScatterHeroSet {
  const most = Math.max(0, Math.floor(options.heroes ?? 32));
  const distance = Math.max(1, options.distance ?? 40);
  const leave = distance * Math.max(1, options.hysteresis ?? 1.2);
  const residentCap = Math.max(most, Math.floor(options.resident ?? most * 2));
  const cell = leave;
  let grid = new Map<string, ScatterHeroMember[]>();
  let known = new Set<string>();
  let heroes: string[] = [];
  // Insertion order is recency: the first key is the least recently used.
  const resident = new Map<string, true>();

  const cellKey = (cx: number, cz: number): string => `${cx},${cz}`;

  function touch(id: string): void {
    resident.delete(id);
    resident.set(id, true);
  }

  return {
    setMembers(members) {
      grid = new Map();
      known = new Set();
      for (const member of members) {
        known.add(member.id);
        const key = cellKey(Math.floor(member.x / cell), Math.floor(member.z / cell));
        const list = grid.get(key);
        if (list === undefined) grid.set(key, [member]);
        else list.push(member);
      }
    },
    update(x, z) {
      const current = new Set(heroes);
      const candidates: { id: string; score: number }[] = [];
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          for (const member of grid.get(cellKey(cx + dx, cz + dz)) ?? []) {
            const d = Math.hypot(member.x - x, member.z - z);
            const isHero = current.has(member.id);
            if (d > (isHero ? leave : distance)) continue;
            // A current hero ranks as if it were nearer, so two near-equal placements do not trade places.
            candidates.push({ id: member.id, score: isHero ? d / 1.2 : d });
          }
        }
      }
      candidates.sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const next = candidates.slice(0, most).map((candidate) => candidate.id);
      const changed = next.length !== heroes.length || next.some((id, index) => heroes[index] !== id);
      heroes = next;
      for (const id of heroes) touch(id);
      const evicted: string[] = [];
      const heroSet = new Set(heroes);
      for (const id of resident.keys()) if (!known.has(id)) evicted.push(id);
      for (const id of evicted) resident.delete(id);
      for (const id of resident.keys()) {
        if (resident.size <= residentCap) break;
        if (heroSet.has(id)) continue;
        resident.delete(id);
        evicted.push(id);
      }
      return { heroes, evicted, changed };
    },
    state() {
      return { heroes: [...heroes], resident: [...resident.keys()] };
    },
    restore(state) {
      heroes = [...state.heroes];
      resident.clear();
      for (const id of state.resident) resident.set(id, true);
    },
  };
}
