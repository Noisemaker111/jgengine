/** @capability scatter-generator grow a scatter palette item from a seeded generator's baked variants */

export interface ScatterHeroMember {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

export interface ScatterHeroSetOptions {
  heroes?: number;
  distance?: number;
  /** A hero stays one until this many times `distance`, so the edge does not flicker. Default 1.2. */
  hysteresis?: number;
  resident?: number;
}

export interface ScatterHeroUpdate {
  heroes: readonly string[];
  evicted: readonly string[];
  changed: boolean;
}

export interface ScatterHeroSetState {
  heroes: string[];
  resident: string[];
}

export interface ScatterHeroSet {
  setMembers(members: readonly ScatterHeroMember[]): void;
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
