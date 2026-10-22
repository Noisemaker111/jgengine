import { devtools } from "../devtools/devtools";
import { createNavCrowd, type NavCrowd, type NavCrowdSnapshot } from "../nav/navCrowd";
import type { NavRuntime } from "../nav/navRuntime";
import { resolveRng } from "../random/resolveRng";
import type { PerceptionService } from "../sensor/perception";
import type { Vec3 } from "../world/geometry";
import { selectCover, scoreCoverPoint, type CoverChoice, type CoverQuery, type CoverSource, type CoverWeights } from "./cover";
import {
  assignSquadRoles,
  threatsFromMemory,
  type FireDiscipline,
  type SquadComposition,
  type SquadRole,
  type ThreatReading,
} from "./squadTactics";

/** One combatant the runtime drives: whose side it is on, where it stands, and how hurt it is. */
export interface SquadMemberSpec {
  id: string;
  /** Side the member fights for; only other sides are threats. */
  team: string;
  /** Squad it shares roles and cover with. Defaults to its team. */
  squad?: string;
  position: Vec3;
  /** Health fraction at spawn, which is what the runtime reports until `healthOf` is given. */
  health?: number;
}

/** What a member is doing this tick: moving to cover, holding it, leaning out, falling back, or down. */
export type SquadMode = "advance" | "cover" | "peek" | "retreat" | "down";

/** In-play dials, every one retunable. */
export interface SquadCombatTunables {
  /** Seconds between cover re-selections for one member. Default `0.6`. */
  reselectSeconds?: number;
  /** Most cover points one selection pass scores. Default `24`. */
  maxCoverCandidates?: number;
  /** Radius a member searches for cover, world units. Default `12`. */
  coverRadius?: number;
  /** Most remembered threats one member considers per tick. Default `6`. */
  maxThreats?: number;
  /** Seconds a hit keeps a member pinned and unable to shoot. Default `2.5`. */
  suppressSeconds?: number;
  /** Suppression at or above this pins a member. Default `0.5`. */
  pinAt?: number;
  /** Exposure seconds the run counts as a breach. Default `3`. */
  exposureLimitSeconds?: number;
  /** Crowd walking speed, world units per second. Default `3.2`. */
  speed?: number;
  /** Crowd avoidance radius, world units. Default `0.4`. */
  radius?: number;
  /** How far a goal must move before the crowd is asked to re-plan. Default `0.15`. */
  goalEpsilon?: number;
  /** How much better a rival cover point must score before a held one is abandoned. Default `0.8`. */
  coverSwitchMargin?: number;
  /** Seconds of continuous exposure before a member stops trusting its point and repositions. Default `1.5`. */
  relocateAfterSeconds?: number;
}

/** Everything the squad AI reads from the game, plus its tunables. */
export interface SquadCombatOptions extends SquadCombatTunables {
  nav: NavRuntime;
  perception: PerceptionService;
  /** Bounded cover query — authored geometry (`createCoverField`) or the game's own. */
  cover: CoverSource;
  /** Roles per squad id, or a function that answers for one squad. */
  composition: SquadComposition | ((squad: string) => SquadComposition | undefined);
  /** Role for a squad the composition does not name. Default `{ id: "member" }`. */
  defaultRole?: SquadRole;
  members: readonly SquadMemberSpec[];
  /** Which side an id fights for, so a remembered target can be classed as hostile. */
  teamOf: (id: string) => string | null;
  /** Authoritative health fraction for a member. Default the spawn value. */
  healthOf?: (id: string) => number;
  /** True when nothing blocks the segment — the game's collision layer. */
  blocked: (from: Vec3, to: Vec3) => boolean;
  /**
   * Fire one paced shot and resolve it in the game's own damage pipeline. Returns damage dealt, which
   * the runtime only counts; call {@link SquadCombat.underFire} on the victim yourself.
   */
  engage?: (memberId: string, targetId: string, distance: number) => number;
  /** Seeded `[0,1)` stream, used to de-sync each member's peek phase. */
  rng?: () => number;
  /** Register a devtools probe under this name so the overlay shows the squad's behavior. */
  devtoolsName?: string;
}

/** One member as a HUD, a probe or a test reads it. Allocates. */
export interface SquadMemberView {
  id: string;
  team: string;
  squad: string;
  role: string;
  mode: SquadMode;
  target: string | null;
  /** Cover point the member is heading for or holding. */
  cover: string | null;
  position: Vec3;
  health: number;
  /** `0..1` incoming-fire meter; high values pin the member to cover and stop its fire. */
  suppression: number;
  /** Consecutive seconds visible to a remembered threat. */
  exposure: number;
  shots: number;
}

/** Counters a probe or a test reads. */
export interface SquadCombatStats {
  members: number;
  ticks: number;
  coverQueries: number;
  coverScored: number;
  losChecks: number;
  shots: number;
  /** Worst consecutive exposure against a remembered threat, seconds. */
  worstExposure: number;
  /** Exposure spells longer than `exposureLimitSeconds`. */
  exposuresOverLimit: number;
  slowestTickMs: number;
}

/** Serializable squad state: member decisions, the crowd, and the tuning they ran under. */
export interface SquadCombatSnapshot {
  nowMs: number;
  tunables: Required<SquadCombatTunables>;
  members: {
    id: string;
    team: string;
    squad: string;
    role: string;
    mode: SquadMode;
    health: number;
    target: string | null;
    targetPosition: Vec3 | null;
    coverId: string | null;
    coverPosition: Vec3 | null;
    coverHidden: number;
    goal: Vec3 | null;
    reselect: number;
    peek: number;
    peeking: boolean;
    fire: number;
    suppression: number;
    exposure: number;
    shots: number;
  }[];
  crowd: NavCrowdSnapshot;
  ticks: number;
  coverQueries: number;
  coverScored: number;
  losChecks: number;
  shots: number;
  worstExposure: number;
  exposuresOverLimit: number;
}

/** Drive a squad: cover by threat, flanking, fire discipline, suppression and retreat. */
export interface SquadCombat {
  /** Advance every member one tick; movement goes through the shared nav crowd. */
  tick(dt: number): void;
  /** Report incoming fire on a member: raises its suppression and pins it to cover. */
  underFire(memberId: string, amount?: number): void;
  member(id: string): SquadMemberView | null;
  members(): readonly SquadMemberView[];
  stats(): SquadCombatStats;
  retune(patch: SquadCombatTunables): void;
  snapshot(): SquadCombatSnapshot;
  restore(next: SquadCombatSnapshot): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

interface ResolvedRole {
  id: string;
  preferredRange: number;
  flankAngle: number;
  retreatBelow: number;
  holdCover: boolean;
  discipline: Required<FireDiscipline>;
  cover: CoverWeights;
}

interface Member {
  id: string;
  team: string;
  squad: string;
  role: ResolvedRole;
  health: number;
  mode: SquadMode;
  target: string | null;
  targetPosition: Vec3 | null;
  /** The strongest remembered threat, seen or not — where a peek leans out to look. */
  threatPosition: Vec3 | null;
  cover: CoverChoice | null;
  goal: Vec3 | null;
  reselect: number;
  peek: number;
  peeking: boolean;
  fire: number;
  suppression: number;
  exposure: number;
  shots: number;
  /** Built once: this member's side test for a remembered target id. */
  hostile: (targetId: string) => boolean;
}

const ROLE_DEFAULTS = {
  preferredRange: 6,
  flankAngle: 0,
  retreatBelow: 0,
  holdCover: false,
  discipline: { holdSeconds: 1.6, peekSeconds: 1, peekDistance: 1.3, fireInterval: 0.7 } as Required<FireDiscipline>,
};

const TUNABLE_DEFAULTS: Required<SquadCombatTunables> = {
  reselectSeconds: 0.6,
  maxCoverCandidates: 24,
  coverRadius: 12,
  maxThreats: 6,
  suppressSeconds: 2.5,
  pinAt: 0.5,
  exposureLimitSeconds: 3,
  speed: 3.2,
  radius: 0.4,
  goalEpsilon: 0.15,
  coverSwitchMargin: 0.8,
  relocateAfterSeconds: 1.5,
};

function resolveRole(role: SquadRole): ResolvedRole {
  return {
    id: role.id,
    preferredRange: Math.max(0, role.preferredRange ?? ROLE_DEFAULTS.preferredRange),
    flankAngle: role.flankAngle ?? ROLE_DEFAULTS.flankAngle,
    retreatBelow: Math.max(0, Math.min(1, role.retreatBelow ?? ROLE_DEFAULTS.retreatBelow)),
    holdCover: role.holdCover ?? ROLE_DEFAULTS.holdCover,
    discipline: { ...ROLE_DEFAULTS.discipline, ...(role.discipline ?? {}) },
    cover: { ...(role.cover ?? {}) },
  };
}

function flatDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function pointToward(from: Vec3, to: Vec3, distance: number): Vec3 {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  if (length < 0.0001) return from;
  return [from[0] + (dx / length) * distance, from[1], from[2] + (dz / length) * distance];
}

function samePoint(a: Vec3 | null, b: Vec3 | null, epsilon: number): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon && Math.abs(a[2] - b[2]) <= epsilon;
}

function copy(point: Vec3 | null): Vec3 | null {
  return point === null ? null : [point[0], point[1], point[2]];
}

/**
 * One squad's combat behavior per tick, over the perception memory a game already keeps and the nav
 * crowd it already moves. Each member picks a stand point that hides it from the threats it remembers,
 * at the distance and angle its role wants; a flanker goes around the side, a support holds and fires,
 * an assault closes. Incoming fire raises suppression, which pins the member to its cover and stops
 * its shooting until the meter decays; low health turns it toward the point furthest from the threat.
 *
 * Cover refresh runs on a per-member timer, so the per-tick cost is the crowd step plus one bounded
 * memory read and a handful of segment tests per member — not a world scan.
 *
 * @capability squad-combat threat-driven cover, flanking, suppression, retreat and role-driven fire discipline
 */
export function createSquadCombat(options: SquadCombatOptions): SquadCombat {
  const nav = options.nav;
  const perception = options.perception;
  const coverSource = options.cover;
  const teamOf = options.teamOf;
  const blocked = options.blocked;
  const engage = options.engage;
  const healthOf = options.healthOf;
  const rng = resolveRng(options.rng, "createSquadCombat");
  let tunables: Required<SquadCombatTunables> = { ...TUNABLE_DEFAULTS };

  const crowd: NavCrowd = createNavCrowd({
    nav,
    speed: tunables.speed,
    radius: tunables.radius,
    // A stand point only hides the body if the body actually reaches it; the default half-metre
    // arrival tolerance leaves an agent half in the open.
    goalRadius: 0.15,
    waypointRadius: 0.2,
    replanBudget: 6,
    replanMs: 1.2,
  });

  const rolesById = new Map<string, ResolvedRole>();
  const defaultRole = resolveRole(options.defaultRole ?? { id: "member" });
  const members: Member[] = [];
  const memberOf = new Map<string, Member>();
  const squads = new Map<string, string[]>();

  let nowMs = 0;
  let ticks = 0;
  let coverQueries = 0;
  let coverScored = 0;
  let losChecks = 0;
  let shots = 0;
  let worstExposure = 0;
  let exposuresOverLimit = 0;
  let slowestTickMs = 0;

  for (const spec of options.members) {
    const squad = spec.squad ?? spec.team;
    const list = squads.get(squad) ?? [];
    list.push(spec.id);
    squads.set(squad, list);
    const member: Member = {
      id: spec.id,
      team: spec.team,
      squad,
      role: defaultRole,
      health: spec.health ?? 1,
      mode: "advance",
      target: null,
      targetPosition: null,
      threatPosition: null,
      cover: null,
      goal: null,
      reselect: 0,
      peek: 0,
      peeking: false,
      fire: 0,
      suppression: 0,
      exposure: 0,
      shots: 0,
      hostile: (targetId) => teamOf(targetId) !== spec.team,
    };
    members.push(member);
    memberOf.set(member.id, member);
    crowd.add(member.id, { position: spec.position, goal: spec.position });
    // De-sync peek phases so a squad does not lean out in lockstep.
    member.peek = rng() * (member.role.discipline.holdSeconds + member.role.discipline.peekSeconds);
  }

  function compositionFor(squad: string): SquadComposition | undefined {
    return typeof options.composition === "function" ? options.composition(squad) : options.composition;
  }

  for (const [squad, ids] of squads) {
    const squadComposition = compositionFor(squad);
    if (squadComposition === undefined) continue;
    for (const [id, role] of assignSquadRoles(ids, squadComposition)) {
      const resolved = resolveRole(role);
      rolesById.set(resolved.id, resolved);
      memberOf.get(id)!.role = resolved;
    }
  }

  function squadLine(squad: string): Vec3 | null {
    const ids = squads.get(squad);
    if (ids === undefined || ids.length === 0) return null;
    let x = 0;
    let y = 0;
    let z = 0;
    let counted = 0;
    for (const id of ids) {
      const body = crowd.agent(id);
      if (body === null) continue;
      x += body.position[0];
      y += body.position[1];
      z += body.position[2];
      counted += 1;
    }
    return counted === 0 ? null : [x / counted, y / counted, z / counted];
  }

  function positionOf(member: Member): Vec3 {
    return crowd.agent(member.id)?.position ?? [0, 0, 0];
  }

  /**
   * Where a peek steps to: straight out at the threat when the face already points at it, otherwise
   * along the wall toward the end of cover, which is where a body actually gets a sight line.
   */
  function peekSpot(member: Member): Vec3 {
    const point = member.cover!.point;
    const threat = member.threatPosition!;
    const dx = threat[0] - point.position[0];
    const dz = threat[2] - point.position[2];
    const [nx, nz] = point.normal;
    const along = dx * nx + dz * nz;
    if (along >= 0) return pointToward(point.position, threat, member.role.discipline.peekDistance);
    const lateralX = dx - nx * along;
    const lateralZ = dz - nz * along;
    const length = Math.hypot(lateralX, lateralZ);
    const step = member.role.discipline.peekDistance;
    if (length < 1e-6) return [point.position[0] + nx * step, point.position[1], point.position[2] + nz * step];
    return [point.position[0] + (lateralX / length) * step, point.position[1], point.position[2] + (lateralZ / length) * step];
  }

  function lineOfSight(from: Vec3, to: Vec3): boolean {
    losChecks += 1;
    return !blocked(from, to);
  }

  function selectPoint(
    member: Member,
    threats: readonly ThreatReading[],
    taken: ReadonlySet<string>,
    retreating: boolean,
    survival: boolean,
  ): void {
    const position = positionOf(member);
    const radius = tunables.coverRadius;
    coverQueries += 1;
    const candidates = coverSource.near(position, radius, tunables.maxCoverCandidates);
    coverScored += candidates.length;
    if (candidates.length === 0) {
      member.cover = null;
      return;
    }
    const line = squadLine(member.squad) ?? position;
    const weights: CoverWeights = survival
      ? { hidden: 6, range: 0, flank: 0, near: 0.2, retreat: 1, path: 1, crowding: 1 }
      : retreating
        ? { ...member.role.cover, range: 0, flank: 0, near: 0.3, retreat: 1, hidden: 3 }
        : member.role.cover;
    const query: CoverQuery = {
      position,
      radius,
      threats,
      preferredRange: survival || retreating ? radius : member.role.preferredRange,
      flankAngle: survival || retreating ? 0 : member.role.flankAngle,
      lineThrough: line,
      taken,
      blocked: (from, to) => {
        losChecks += 1;
        return blocked(from, to);
      },
      hiddenOnly: true,
      weights,
    };
    const choice = selectCover(candidates, query);
    const held = member.cover === null ? null : scoreCoverPoint(member.cover.point, query);
    // Retention: keep the held point unless the rival hides from strictly more threats, or ties on
    // hiding and scores past the margin. Without it a squad churns between equivalent crates and
    // never stops walking in the open. Under sustained fire there is no retention — move.
    const better =
      choice !== null &&
      (held === null ||
        choice.hidden > held.hidden + 0.001 ||
        (choice.hidden >= held.hidden - 0.001 && choice.score >= held.score + tunables.coverSwitchMargin));
    if (!survival && held !== null && held.hidden > 0 && !better) {
      member.cover = held;
      return;
    }
    member.cover = choice;
  }

  function updateTarget(member: Member, threats: readonly ThreatReading[], position: Vec3): void {
    const reach = member.role.preferredRange * 1.8;
    member.target = null;
    member.targetPosition = null;
    member.threatPosition = threats.find((threat) => threat.ageSeconds <= 12)?.position ?? null;
    for (const threat of threats) {
      if (threat.ageSeconds > 12) continue;
      if (flatDistance(position, threat.position) > reach) continue;
      if (!lineOfSight(position, threat.position)) continue;
      member.target = threat.id;
      member.targetPosition = threat.position;
      return;
    }
  }

  /**
   * The held point is still good only when it hides the member from every remembered threat and the
   * member is not in the open right now. A point that hides from one of two shooters is not cover —
   * it is a spot the other one can shoot.
   */
  function coverStillGood(member: Member, threats: readonly ThreatReading[], holders: ReadonlyMap<string, string>, position: Vec3): boolean {
    if (member.cover === null) return false;
    const holder = holders.get(member.cover.point.id);
    if (holder !== undefined && holder !== member.id) return false;
    for (const threat of threats) {
      if (threat.confidence < 0.05) continue;
      if (lineOfSight(member.cover.point.position, threat.position)) return false;
      if (lineOfSight(position, threat.position)) return false;
    }
    return true;
  }

  function decide(
    member: Member,
    threats: readonly ThreatReading[],
    holders: ReadonlyMap<string, string>,
    dt: number,
  ): void {
    member.health = healthOf === undefined ? member.health : healthOf(member.id);
    if (member.health <= 0) {
      member.mode = "down";
      member.target = null;
      member.targetPosition = null;
      member.cover = null;
      member.goal = null;
      return;
    }

    const position = positionOf(member);
    member.suppression = Math.max(0, member.suppression - dt / Math.max(0.001, tunables.suppressSeconds));
    member.reselect = Math.max(0, member.reselect - dt);
    member.fire = Math.max(0, member.fire - dt);

    const pinned = member.suppression >= tunables.pinAt;
    const retreating = member.role.retreatBelow > 0 && member.health <= member.role.retreatBelow;
    const survival = member.exposure > tunables.relocateAfterSeconds;
    updateTarget(member, threats, position);

    if (member.cover === null || member.reselect <= 0 || survival || !coverStillGood(member, threats, holders, position)) {
      const taken = new Set<string>();
      for (const [pointId, holder] of holders) if (holder !== member.id) taken.add(pointId);
      // Under sustained fire, stop trusting the point the member is already at.
      if (survival && member.cover !== null) taken.add(member.cover.point.id);
      selectPoint(member, threats, taken, retreating, survival);
      member.reselect = tunables.reselectSeconds;
    }

    const atCover = member.cover !== null && flatDistance(position, member.cover.point.position) <= 0.9;
    const targetVisible = member.target !== null && (member.targetPosition === null || lineOfSight(position, member.targetPosition));

    if (retreating) member.mode = "retreat";
    else if (member.cover === null) member.mode = "advance";
    else if (!atCover) member.mode = "advance";
    else member.mode = "cover";

    if (member.mode === "cover" && atCover && member.threatPosition !== null && !pinned && !member.role.holdCover) {
      member.peek -= dt;
      if (member.peek <= 0) {
        member.peeking = !member.peeking;
        member.peek = member.peeking ? member.role.discipline.peekSeconds : member.role.discipline.holdSeconds;
      }
      if (member.peeking) member.mode = "peek";
    } else {
      member.peeking = false;
    }

    if (pinned) {
      // Suppression only holds a member that already has cover; in the open it keeps running to it.
      member.goal = member.cover === null || atCover ? position : member.cover.point.position;
    } else if (member.cover === null) {
      const gap = member.targetPosition === null ? 0 : flatDistance(position, member.targetPosition) - member.role.preferredRange;
      member.goal = member.targetPosition === null || gap <= 0
        ? position
        : pointToward(position, member.targetPosition, Math.max(1, gap));
    } else if (member.mode === "peek" && member.threatPosition !== null) {
      member.goal = peekSpot(member);
    } else {
      member.goal = member.cover.point.position;
    }

    if (!retreating && targetVisible && member.target !== null && member.targetPosition !== null && member.fire <= 0) {
      member.fire = Math.max(0.05, member.role.discipline.fireInterval);
      member.shots += 1;
      shots += 1;
      engage?.(member.id, member.target, flatDistance(position, member.targetPosition));
    }

    let visible = false;
    for (const threat of threats) {
      if (threat.confidence < 0.05) continue;
      if (lineOfSight(position, threat.position)) {
        visible = true;
        break;
      }
    }
    const wasOver = member.exposure > tunables.exposureLimitSeconds;
    member.exposure = visible ? member.exposure + dt : 0;
    if (member.exposure > worstExposure) worstExposure = member.exposure;
    if (member.exposure > tunables.exposureLimitSeconds && !wasOver) exposuresOverLimit += 1;
  }

  function viewOf(member: Member): SquadMemberView {
    return {
      id: member.id,
      team: member.team,
      squad: member.squad,
      role: member.role.id,
      mode: member.mode,
      target: member.target,
      cover: member.cover?.point.id ?? null,
      position: positionOf(member),
      health: member.health,
      suppression: member.suppression,
      exposure: member.exposure,
      shots: member.shots,
    };
  }

  function probeLine(): string {
    let pinned = 0;
    let peeking = 0;
    for (const member of members) {
      if (member.suppression >= tunables.pinAt) pinned += 1;
      if (member.mode === "peek") peeking += 1;
    }
    return `${members.length} members ${pinned} pinned ${peeking} peeking · ${shots} shots · ${worstExposure.toFixed(1)}s worst exposure ${exposuresOverLimit} over ${tunables.exposureLimitSeconds}s · ${coverQueries} cover queries`;
  }

  const unregister = options.devtoolsName === undefined ? null : devtools.probes.register(options.devtoolsName, () => probeLine());

  return {
    tick(dt) {
      if (!(dt > 0) || members.length === 0) return;
      const started = performance.now();
      nowMs += dt * 1000;
      ticks += 1;

      const holders = new Map<string, string>();
      for (const member of members) if (member.cover !== null) holders.set(member.cover.point.id, member.id);

      for (const member of members) {
        const threats = threatsFromMemory(perception, member.id, nowMs, {
          max: tunables.maxThreats,
          hostile: member.hostile,
        });
        decide(member, threats, holders, dt);
        for (const [pointId, holder] of holders) if (holder === member.id) holders.delete(pointId);
        if (member.cover !== null) holders.set(member.cover.point.id, member.id);
        const body = crowd.agent(member.id);
        if (body === null) continue;
        const goal = member.mode === "down" ? body.position : member.goal ?? body.position;
        if (!samePoint(body.goal, goal, tunables.goalEpsilon)) crowd.setGoal(member.id, goal);
      }

      crowd.tick(dt);
      slowestTickMs = Math.max(slowestTickMs, performance.now() - started);
    },
    underFire(memberId, amount = 1) {
      const member = memberOf.get(memberId);
      if (member === undefined || amount <= 0) return;
      member.suppression = Math.min(1, member.suppression + amount);
      member.reselect = Math.min(member.reselect, 0.05);
    },
    member(id) {
      const member = memberOf.get(id);
      return member === undefined ? null : viewOf(member);
    },
    members: () => members.map(viewOf),
    stats: () => ({
      members: members.length,
      ticks,
      coverQueries,
      coverScored,
      losChecks,
      shots,
      worstExposure,
      exposuresOverLimit,
      slowestTickMs,
    }),
    retune(patch) {
      const next: Required<SquadCombatTunables> = { ...tunables };
      for (const key of Object.keys(TUNABLE_DEFAULTS) as (keyof SquadCombatTunables)[]) {
        const value = patch[key];
        if (value !== undefined) next[key] = Math.max(0, value);
      }
      tunables = next;
      crowd.retune({ speed: tunables.speed, radius: tunables.radius });
    },
    snapshot() {
      return {
        nowMs,
        tunables: { ...tunables },
        members: members.map((member) => ({
          id: member.id,
          team: member.team,
          squad: member.squad,
          role: member.role.id,
          mode: member.mode,
          health: member.health,
          target: member.target,
          targetPosition: copy(member.targetPosition),
          coverId: member.cover?.point.id ?? null,
          coverPosition: copy(member.cover?.point.position ?? null),
          coverHidden: member.cover?.hidden ?? 0,
          goal: copy(member.goal),
          reselect: member.reselect,
          peek: member.peek,
          peeking: member.peeking,
          fire: member.fire,
          suppression: member.suppression,
          exposure: member.exposure,
          shots: member.shots,
        })),
        crowd: crowd.snapshot(),
        ticks,
        coverQueries,
        coverScored,
        losChecks,
        shots,
        worstExposure,
        exposuresOverLimit,
      };
    },
    restore(next) {
      nowMs = next.nowMs;
      ticks = next.ticks;
      coverQueries = next.coverQueries;
      coverScored = next.coverScored;
      losChecks = next.losChecks;
      shots = next.shots;
      worstExposure = next.worstExposure;
      exposuresOverLimit = next.exposuresOverLimit;
      tunables = { ...next.tunables };
      crowd.restore(next.crowd);
      crowd.retune({ speed: tunables.speed, radius: tunables.radius });
      members.length = 0;
      memberOf.clear();
      squads.clear();
      for (const saved of next.members) {
        const member: Member = {
          id: saved.id,
          team: saved.team,
          squad: saved.squad,
          role: rolesById.get(saved.role) ?? defaultRole,
          health: saved.health,
          mode: saved.mode,
          target: saved.target,
          targetPosition: copy(saved.targetPosition),
          threatPosition: null,
          cover:
            saved.coverId === null || saved.coverPosition === null
              ? null
              : {
                  point: { id: saved.coverId, position: copy(saved.coverPosition)!, normal: [0, 0] },
                  score: 0,
                  hidden: saved.coverHidden,
                  range: 0,
                  flank: 0,
                  near: 0,
                  retreat: 0,
                  path: 0,
                },
          goal: copy(saved.goal),
          reselect: saved.reselect,
          peek: saved.peek,
          peeking: saved.peeking,
          fire: saved.fire,
          suppression: saved.suppression,
          exposure: saved.exposure,
          shots: saved.shots,
          hostile: (targetId) => teamOf(targetId) !== saved.team,
        };
        members.push(member);
        memberOf.set(member.id, member);
        const list = squads.get(member.squad) ?? [];
        list.push(member.id);
        squads.set(member.squad, list);
      }
    },
    dispose() {
      unregister?.();
      crowd.dispose();
    },
  };
}
