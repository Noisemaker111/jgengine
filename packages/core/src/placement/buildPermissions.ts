import { evaluatePredicate, type Predicate } from "../rules/predicate";

/**
 * The roles one game's build plots use, from fewest build rights to most, and which role carries
 * which right. The ladder is the game's data: a plot can have any named roles.
 */
export interface BuildRoleLadder<R extends string> {
  /** Every role a plot can carry, fewest build rights first. The last role is the owner's. */
  ladder: readonly R[];
  /** The lowest ladder role that may edit; it and every role above it can build. */
  editor: R;
  /** The ladder role a guild joins at when `setGuild` names none. */
  guildDefault: R;
}

/** Looking needs any role at all. */
const CAN_VIEW: Predicate = { has: "role" };

/** Initial owner, guild and per-player roles for one build plot. */
export interface PlotPermissionConfig<R extends string> extends BuildRoleLadder<R> {
  plotId: string;
  ownerId: string;
  guildId?: string;
  roles?: Readonly<Record<string, R>>;
  guildRole?: R;
}

/** Serializable copy of a plot's owner, guild and roles. */
export interface PlotPermissionSnapshot<R extends string> {
  plotId: string;
  ownerId: string;
  guildId?: string;
  roles: Readonly<Record<string, R>>;
  guildRole?: R;
}

/** The player asking to build, with their guild if any. */
export interface BuildActor {
  userId: string;
  guildId?: string;
}

/** Live permissions for one plot: role lookups, edit and view checks, grants, ownership transfer and snapshot/restore. */
export interface PlotPermissions<R extends string> {
  roleOf(actor: BuildActor): R | null;
  canEdit(actor: BuildActor): boolean;
  canView(actor: BuildActor): boolean;
  grant(userId: string, role: R): void;
  revoke(userId: string): void;
  setGuild(guildId: string | null, role?: R): void;
  transferOwner(userId: string): void;
  snapshot(): PlotPermissionSnapshot<R>;
  /** Replace owner, guild and grants from a {@link snapshot}; plot identity stays the config's. */
  restore(next: PlotPermissionSnapshot<R>): void;
}

/**
 * Creates the build permissions for one plot over the caller's own role ladder. `editor` and
 * `guildDefault` must be roles on the ladder; an owner always carries the top role.
 *
 * @capability plot-permissions Owner, editor and guild build rights on a plot
 */
export function createPlotPermissions<R extends string>(
  config: PlotPermissionConfig<R>,
): PlotPermissions<R> {
  const { ladder } = config;
  const ownerRole = ladder[ladder.length - 1];
  if (ownerRole === undefined) throw new RangeError("A plot role ladder needs at least one role");
  const topRole: R = ownerRole;
  const editorRank = ladder.indexOf(config.editor);
  if (editorRank < 0) {
    throw new RangeError(`editor role "${config.editor}" is not on the plot's role ladder`);
  }
  if (ladder.indexOf(config.guildDefault) < 0) {
    throw new RangeError(`guild role "${config.guildDefault}" is not on the plot's role ladder`);
  }
  /** Editing needs the `editor` rank or above. */
  const canEditRule: Predicate = { gte: ["rank", editorRank] };

  let ownerId = config.ownerId;
  let guildId = config.guildId;
  let guildRole = config.guildRole;
  const roles = new Map<string, R>(Object.entries(config.roles ?? {}));

  function roleOf(actor: BuildActor): R | null {
    if (actor.userId === ownerId) return topRole;
    const explicit = roles.get(actor.userId);
    if (explicit !== undefined) return explicit;
    if (
      guildId !== undefined &&
      guildRole !== undefined &&
      actor.guildId !== undefined &&
      actor.guildId === guildId
    ) {
      return guildRole;
    }
    return null;
  }

  return {
    roleOf,
    canEdit(actor) {
      const role = roleOf(actor);
      return evaluatePredicate(canEditRule, { rank: role === null ? -1 : ladder.indexOf(role) });
    },
    canView(actor) {
      return evaluatePredicate(CAN_VIEW, { role: roleOf(actor) });
    },
    grant(userId, role) {
      if (userId === ownerId) return;
      roles.set(userId, role);
    },
    revoke(userId) {
      roles.delete(userId);
    },
    setGuild(nextGuildId, role) {
      guildId = nextGuildId ?? undefined;
      guildRole =
        nextGuildId === null ? undefined : role ?? guildRole ?? config.guildDefault;
    },
    transferOwner(userId) {
      roles.delete(userId);
      ownerId = userId;
    },
    snapshot() {
      return {
        plotId: config.plotId,
        ownerId,
        ...(guildId === undefined ? {} : { guildId }),
        roles: Object.fromEntries(roles),
        ...(guildRole === undefined ? {} : { guildRole }),
      };
    },
    restore(next) {
      ownerId = next.ownerId;
      guildId = next.guildId;
      guildRole = next.guildRole;
      roles.clear();
      for (const [userId, role] of Object.entries(next.roles)) {
        if (userId !== next.ownerId) roles.set(userId, role);
      }
    },
  };
}

/** Resource amounts a shared build needs, keyed by resource id. */
export type ContributionGoal = Readonly<Record<string, number>>;

/** What one contribution did: amount accepted, overflow returned and whether the goal is now met. */
export interface ContributionResult {
  accepted: number;
  overflow: number;
  complete: boolean;
}

/** Shared resource pool players pay into until a build goal is met. */
export interface ContributionPool {
  contribute(userId: string, resource: string, amount: number): ContributionResult;
  totals(): Readonly<Record<string, number>>;
  remaining(): Readonly<Record<string, number>>;
  byContributor(userId: string): Readonly<Record<string, number>>;
  progress(): number;
  isComplete(): boolean;
  snapshot(): Record<string, Record<string, number>>;
  restore(snapshot: Record<string, Record<string, number>>): void;
}

/**
 * Creates a shared contribution pool for a build goal.
 * @capability contribution-pool Players pool resources toward a shared build goal
 */
export function createContributionPool(goal: ContributionGoal): ContributionPool {
  const perResource = new Map<string, Map<string, number>>();

  function totalFor(resource: string): number {
    let sum = 0;
    for (const amount of perResource.get(resource)?.values() ?? []) sum += amount;
    return sum;
  }

  function totals(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const resource of Object.keys(goal)) out[resource] = totalFor(resource);
    return out;
  }

  function isComplete(): boolean {
    for (const resource of Object.keys(goal)) {
      if (totalFor(resource) < goal[resource]!) return false;
    }
    return true;
  }

  return {
    contribute(userId, resource, amount) {
      if (amount <= 0 || goal[resource] === undefined) {
        return { accepted: 0, overflow: amount > 0 ? amount : 0, complete: isComplete() };
      }
      const need = Math.max(0, goal[resource]! - totalFor(resource));
      const accepted = Math.min(need, amount);
      const overflow = amount - accepted;
      if (accepted > 0) {
        const contributors = perResource.get(resource) ?? new Map<string, number>();
        contributors.set(userId, (contributors.get(userId) ?? 0) + accepted);
        perResource.set(resource, contributors);
      }
      return { accepted, overflow, complete: isComplete() };
    },
    totals,
    remaining() {
      const out: Record<string, number> = {};
      for (const resource of Object.keys(goal)) out[resource] = Math.max(0, goal[resource]! - totalFor(resource));
      return out;
    },
    byContributor(userId) {
      const out: Record<string, number> = {};
      for (const [resource, contributors] of perResource) {
        const amount = contributors.get(userId);
        if (amount !== undefined) out[resource] = amount;
      }
      return out;
    },
    progress() {
      const resources = Object.keys(goal);
      if (resources.length === 0) return 1;
      let sum = 0;
      for (const resource of resources) {
        const target = goal[resource]!;
        sum += target <= 0 ? 1 : Math.min(1, totalFor(resource) / target);
      }
      return sum / resources.length;
    },
    isComplete,
    snapshot() {
      const out: Record<string, Record<string, number>> = {};
      for (const [resource, contributors] of perResource) out[resource] = Object.fromEntries(contributors);
      return out;
    },
    restore(snapshot) {
      perResource.clear();
      for (const [resource, contributors] of Object.entries(snapshot)) {
        perResource.set(resource, new Map(Object.entries(contributors)));
      }
    },
  };
}
