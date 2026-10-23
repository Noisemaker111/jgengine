import type { SquadComposition, SquadRole } from "../../combat/squadTactics";
import type { Vec3 } from "../../world/geometry";

/**
 * The five duties a fighter can be given in a fight. A duty is *who does what*; the squad role a
 * game dials (range, angles, fire discipline) is *how that duty fights* and stays content.
 */
export type FightIntent = "retreat" | "hold" | "flank" | "cover" | "assault";

/** One fighter the director can order, with the state the decision reads. */
export interface FighterState {
  id: string;
  /** Position on the ground plane; only `x` and `z` are read. */
  position: Vec3;
  /** Health fraction `0..1`. */
  health: number;
  /** True while the fighter is taking fire this tick. */
  underFire?: boolean;
}

/** The squad as it stands and the enemy it is facing, or no enemy at all. */
export interface FightSituation {
  fighters: readonly FighterState[];
  /** Where the squad last knew the enemy to be, or null when it has no contact. */
  threat: Vec3 | null;
  /** Health fraction at or below which a fighter falls back. Default `0.25`. */
  retreatBelow?: number;
}

/** What the director decided, per fighter, and why. */
export interface FightOrders {
  /** Duty per fighter id. Every fighter in the situation appears exactly once. */
  intents: Map<string, FightIntent>;
  /** How many fighters took each duty, for a HUD or a test. */
  counts: Record<FightIntent, number>;
  /** One line naming the terms that drove the split. */
  reason: string;
}

const DEFAULT_RETREAT_BELOW = 0.25;

function flatDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/**
 * Assign each fighter a duty from the squad's own state — who is hurt, who is under fire, and who
 * already stands on the outside of the formation — never from an authored order or a spawn index.
 *
 * Rules, applied in this order:
 * 1. A fighter at or below `retreatBelow` health falls back (`retreat`).
 * 2. With no known enemy the rest advance (`assault`); there is nothing to hold, flank or hide from.
 * 3. Against a known enemy one fighter holds the line: the healthiest fighter closest to the
 *    squad's centre, ties broken by id, so the anchor is the one already standing there.
 * 4. A third of what is left flanks, taken from the outside of the formation, alternating sides so
 *    a squad never stacks its flankers on one shoulder. Under fire disqualifies a flanker.
 * 5. Everyone else fights from cover, which is where `createSquadCombat` puts them anyway.
 *
 * Deterministic: same situation, same orders, and input order does not change a duty.
 *
 * @capability fight-intents assign hold, flank, cover, assault and retreat duties from live squad state
 */
export function assignFightIntents(situation: FightSituation): FightOrders {
  const retreatBelow = situation.retreatBelow ?? DEFAULT_RETREAT_BELOW;
  const intents = new Map<string, FightIntent>();
  const counts: Record<FightIntent, number> = { retreat: 0, hold: 0, flank: 0, cover: 0, assault: 0 };
  const fighters = [...situation.fighters].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const assign = (fighter: FighterState, intent: FightIntent): void => {
    intents.set(fighter.id, intent);
    counts[intent] += 1;
  };

  let x = 0;
  let z = 0;
  for (const fighter of fighters) {
    x += fighter.position[0];
    z += fighter.position[2];
  }
  const centre: Vec3 = fighters.length === 0 ? [0, 0, 0] : [x / fighters.length, 0, z / fighters.length];

  const remaining: FighterState[] = [];
  for (const fighter of fighters) {
    if (fighter.health <= retreatBelow) assign(fighter, "retreat");
    else remaining.push(fighter);
  }

  const threat = situation.threat;
  if (threat === null) {
    for (const fighter of remaining) assign(fighter, "assault");
    return {
      intents,
      counts,
      reason: `no contact: ${counts.assault} assault, ${counts.retreat} retreat below ${retreatBelow}`,
    };
  }

  const forwardLength = Math.max(0.0001, flatDistance(centre, threat));
  const forwardX = (threat[0] - centre[0]) / forwardLength;
  const forwardZ = (threat[2] - centre[2]) / forwardLength;
  const sideOf = (fighter: FighterState): number =>
    forwardX * (fighter.position[2] - centre[2]) - forwardZ * (fighter.position[0] - centre[0]);

  if (remaining.length > 0) {
    let anchor = remaining[0]!;
    for (const fighter of remaining) {
      const candidate = Math.abs(sideOf(fighter));
      const held = Math.abs(sideOf(anchor));
      if (candidate < held - 0.0001 || (Math.abs(candidate - held) <= 0.0001 && fighter.health > anchor.health)) {
        anchor = fighter;
      }
    }
    assign(anchor, "hold");
  }

  const candidates = remaining
    .filter((fighter) => intents.get(fighter.id) !== "hold" && fighter.underFire !== true)
    .sort((a, b) => {
      const lateral = Math.abs(sideOf(b)) - Math.abs(sideOf(a));
      if (Math.abs(lateral) > 0.0001) return lateral;
      const health = b.health - a.health;
      if (Math.abs(health) > 0.0001) return health;
      return a.id < b.id ? -1 : 1;
    });

  let flankers = Math.min(candidates.length, Math.floor(remaining.length / 3));
  let side = 0;
  while (flankers > 0) {
    const pick =
      side === 0
        ? candidates.find((fighter) => intents.get(fighter.id) === undefined)
        : candidates.find(
            (fighter) => intents.get(fighter.id) === undefined && Math.sign(sideOf(fighter)) === side,
          ) ?? candidates.find((fighter) => intents.get(fighter.id) === undefined);
    if (pick === undefined) break;
    assign(pick, "flank");
    side = side === 0 ? -Math.sign(sideOf(pick)) : -side;
    flankers -= 1;
  }

  for (const fighter of remaining) if (intents.get(fighter.id) === undefined) assign(fighter, "cover");

  return {
    intents,
    counts,
    reason:
      `${counts.hold} hold, ${counts.flank} flank, ${counts.cover} cover, ${counts.assault} assault, ` +
      `${counts.retreat} retreat below ${retreatBelow}`,
  };
}

/**
 * Turn duties into a squad composition `createSquadCombat` accepts: one slot per fighter, in the
 * order the game gives its members, each mapped to the role that game dials for the duty. Build it
 * through `composition` so squad combat executes the director's assignment instead of its own
 * static list.
 *
 * @capability fight-intent-composition map assigned duties onto a squad combat composition in member order
 */
export function compositionForIntents(
  order: readonly string[],
  intents: ReadonlyMap<string, FightIntent>,
  roleFor: (intent: FightIntent) => SquadRole,
): SquadComposition {
  const roles: SquadRole[] = [];
  for (const id of order) {
    const intent = intents.get(id);
    roles.push({ ...roleFor(intent ?? "cover"), count: 1 });
  }
  return { roles };
}
