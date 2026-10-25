/** Whether a smaller result (a lap time) or a larger one (a score) is the better run. */
export type MedalDirection = "lower" | "higher";

/** One medal grade. Listed lowest first; `points` is what holding it counts toward tiers. */
export interface MedalDef {
  id: string;
  label?: string;
  points: number;
}

/**
 * One event on the board: a metric, which way is better, and the result each medal needs. A medal
 * left out of `targets` cannot be earned on this event.
 */
export interface MedalEventDef {
  id: string;
  label?: string;
  /** The tier this event sits in; it opens with that tier. Omitted means always open. */
  tier?: string;
  direction: MedalDirection;
  targets: Readonly<Record<string, number>>;
}

/** A group of events that opens once the board holds `requires` medal points. */
export interface MedalTierDef {
  id: string;
  label?: string;
  requires: number;
}

/** Everything a medal board stores, as plain JSON: each event's best result. */
export interface MedalBoardState {
  best: Record<string, number>;
}

/** Configuration for {@link createMedalBoard}. */
export interface MedalBoardConfig {
  /** Medal grades, lowest first (`bronze`, `silver`, `gold`). */
  medals: readonly MedalDef[];
  events: readonly MedalEventDef[];
  tiers?: readonly MedalTierDef[];
  /** Rehydrate from a prior {@link MedalBoard.snapshot}. */
  state?: MedalBoardState;
}

/** What one submitted result did to the board. */
export interface MedalSubmission {
  eventId: string;
  value: number;
  /** The medal this result earns on its own, or `null`. */
  medal: string | null;
  /** The event's medal before this result. */
  previous: string | null;
  /** True when the result beat the event's stored best. */
  newBest: boolean;
  /** Medals held on this event now and not before, lowest first - the first-time rewards to pay. */
  newlyEarned: readonly string[];
  /** Tiers this result opened. */
  openedTiers: readonly string[];
}

/** The next medal an event offers and the result it needs, for a "beat 41.0 s for gold" line. */
export interface MedalTarget {
  medal: string;
  value: number;
}

/** A tier and how far the board is from it. */
export interface MedalTierStatus {
  tier: MedalTierDef;
  open: boolean;
  /** Points still needed; `0` once open. */
  missing: number;
}

/** Per-event medals over a stored best, with tiers that open on the points those medals add up to. */
export interface MedalBoard {
  medals(): readonly MedalDef[];
  events(): readonly MedalEventDef[];
  event(eventId: string): MedalEventDef | null;
  /** The event's stored best, or `null` before any result. */
  best(eventId: string): number | null;
  /** The best medal held on the event, or `null`. */
  medalOf(eventId: string): string | null;
  /** The medal a result would earn on the event, without recording it. */
  grade(eventId: string, value: number): string | null;
  /** The next medal the event offers above the one held, or `null` when the top medal is held. */
  next(eventId: string): MedalTarget | null;
  /** Medal points held across the board. */
  points(): number;
  /** How many events hold each medal grade or better. */
  count(medalId: string): number;
  tiers(): readonly MedalTierStatus[];
  isOpen(eventId: string): boolean;
  /** Record a result; a closed event or a non-finite value records nothing and throws. */
  submit(eventId: string, value: number): MedalSubmission;
  snapshot(): MedalBoardState;
  restore(next: MedalBoardState): void;
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

const better = (direction: MedalDirection, a: number, b: number): boolean => (direction === "lower" ? a < b : a > b);
const meets = (direction: MedalDirection, value: number, target: number): boolean => (direction === "lower" ? value <= target : value >= target);

/** Check an authored board; throws `RangeError` naming the medal, event or tier at fault. */
export function assertMedalBoard(config: MedalBoardConfig): void {
  check(config.medals.length > 0, "A medal board needs at least one medal");
  const medalIds = new Set<string>();
  let lastPoints = -1;
  for (const medal of config.medals) {
    check(medal.id.trim() !== "", "Medal id must not be empty");
    check(!medalIds.has(medal.id), `Medal "${medal.id}" is listed twice`);
    check(Number.isFinite(medal.points) && medal.points > lastPoints, `Medal "${medal.id}" must be worth more points than the medal before it`);
    medalIds.add(medal.id);
    lastPoints = medal.points;
  }
  const tierIds = new Set<string>();
  for (const tier of config.tiers ?? []) {
    check(tier.id.trim() !== "", "Tier id must not be empty");
    check(!tierIds.has(tier.id), `Tier "${tier.id}" is listed twice`);
    check(Number.isFinite(tier.requires) && tier.requires >= 0, `Tier "${tier.id}" needs a finite, non-negative point requirement`);
    tierIds.add(tier.id);
  }
  const eventIds = new Set<string>();
  for (const event of config.events) {
    check(event.id.trim() !== "", "Event id must not be empty");
    check(!eventIds.has(event.id), `Event "${event.id}" is listed twice`);
    eventIds.add(event.id);
    check(event.tier === undefined || tierIds.has(event.tier), `Event "${event.id}" sits in unknown tier "${event.tier}"`);
    let previous: number | null = null;
    for (const medal of config.medals) {
      const target = event.targets[medal.id];
      if (target === undefined) continue;
      check(Number.isFinite(target), `Event "${event.id}" has a non-finite ${medal.id} target`);
      check(previous === null || meets(event.direction, target, previous), `Event "${event.id}": ${medal.id} must be at least as hard as the medal below it`);
      previous = target;
    }
    for (const key of Object.keys(event.targets)) check(medalIds.has(key), `Event "${event.id}" targets unknown medal "${key}"`);
  }
}

/**
 * A medal board: every event keeps its best result, each medal is a target on that result, and
 * tiers of events open on the medal points the board holds - Trials' and Trackmania's
 * bronze/silver/gold ladder, or a puzzle game's stars. `submit` reports which medals a result earned
 * for the first time, so a game pays one-time rewards from that list.
 *
 * @capability medal-board per-event bronze/silver/gold targets over a stored best, with tiers that open on medal points
 */
export function createMedalBoard(config: MedalBoardConfig): MedalBoard {
  assertMedalBoard(config);
  const medals = config.medals;
  const events = config.events;
  const tiers = config.tiers ?? [];
  const eventById = new Map(events.map((event) => [event.id, event]));
  const medalIndex = new Map(medals.map((medal, index) => [medal.id, index]));
  let best: Record<string, number> = {};

  function restore(next: MedalBoardState): void {
    const clean: Record<string, number> = {};
    for (const [id, value] of Object.entries(next.best ?? {})) {
      if (eventById.has(id) && typeof value === "number" && Number.isFinite(value)) clean[id] = value;
    }
    best = clean;
  }
  if (config.state !== undefined) restore(config.state);

  function grade(eventId: string, value: number): string | null {
    const event = eventById.get(eventId);
    if (event === undefined || !Number.isFinite(value)) return null;
    let earned: string | null = null;
    for (const medal of medals) {
      const target = event.targets[medal.id];
      if (target !== undefined && meets(event.direction, value, target)) earned = medal.id;
    }
    return earned;
  }

  function medalOf(eventId: string): string | null {
    const value = best[eventId];
    return value === undefined ? null : grade(eventId, value);
  }

  function pointsOf(medalId: string | null): number {
    if (medalId === null) return 0;
    return medals[medalIndex.get(medalId) ?? -1]?.points ?? 0;
  }

  function points(): number {
    let total = 0;
    for (const event of events) total += pointsOf(medalOf(event.id));
    return total;
  }

  function tierOpen(tierId: string | undefined, held: number): boolean {
    if (tierId === undefined) return true;
    const tier = tiers.find((entry) => entry.id === tierId);
    return tier === undefined || held >= tier.requires;
  }

  function earnedBetween(from: string | null, to: string | null): string[] {
    const start = from === null ? 0 : (medalIndex.get(from) ?? -1) + 1;
    const end = to === null ? -1 : medalIndex.get(to) ?? -1;
    const earned: string[] = [];
    for (let index = start; index <= end; index += 1) earned.push(medals[index]!.id);
    return earned;
  }

  return {
    medals: () => medals,
    events: () => events,
    event: (eventId) => eventById.get(eventId) ?? null,
    best: (eventId) => best[eventId] ?? null,
    medalOf,
    grade,
    next(eventId) {
      const event = eventById.get(eventId);
      if (event === undefined) return null;
      const held = medalOf(eventId);
      const from = held === null ? 0 : (medalIndex.get(held) ?? -1) + 1;
      for (let index = from; index < medals.length; index += 1) {
        const target = event.targets[medals[index]!.id];
        if (target !== undefined) return { medal: medals[index]!.id, value: target };
      }
      return null;
    },
    points,
    count(medalId) {
      const floor = medalIndex.get(medalId);
      if (floor === undefined) return 0;
      return events.filter((event) => {
        const held = medalOf(event.id);
        return held !== null && (medalIndex.get(held) ?? -1) >= floor;
      }).length;
    },
    tiers() {
      const held = points();
      return tiers.map((tier) => ({ tier, open: held >= tier.requires, missing: Math.max(0, tier.requires - held) }));
    },
    isOpen(eventId) {
      const event = eventById.get(eventId);
      return event !== undefined && tierOpen(event.tier, points());
    },
    submit(eventId, value) {
      const event = eventById.get(eventId);
      check(event !== undefined, `Unknown event "${eventId}"`);
      check(Number.isFinite(value), `Event "${eventId}" needs a finite result`);
      const heldBefore = points();
      check(tierOpen(event!.tier, heldBefore), `Event "${eventId}" is not open yet`);
      const previous = medalOf(eventId);
      const stored = best[eventId];
      const newBest = stored === undefined || better(event!.direction, value, stored);
      if (newBest) best = { ...best, [eventId]: value };
      const now = medalOf(eventId);
      const heldAfter = points();
      const openedTiers = tiers.filter((tier) => heldBefore < tier.requires && heldAfter >= tier.requires).map((tier) => tier.id);
      return { eventId, value, medal: grade(eventId, value), previous, newBest, newlyEarned: earnedBetween(previous, now), openedTiers };
    },
    snapshot: () => ({ best: { ...best } }),
    restore,
  };
}
