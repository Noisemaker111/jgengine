export type BuildRole = "owner" | "editor" | "viewer";

const ROLE_RANK: Record<BuildRole, number> = { viewer: 0, editor: 1, owner: 2 };

export interface PlotPermissionConfig {
  plotId: string;
  ownerId: string;
  guildId?: string;
  roles?: Readonly<Record<string, BuildRole>>;
  guildRole?: BuildRole;
}

export interface PlotPermissionSnapshot {
  plotId: string;
  ownerId: string;
  guildId?: string;
  roles: Readonly<Record<string, BuildRole>>;
  guildRole?: BuildRole;
}

export interface BuildActor {
  userId: string;
  guildId?: string;
}

export interface PlotPermissions {
  roleOf(actor: BuildActor): BuildRole | null;
  canEdit(actor: BuildActor): boolean;
  canView(actor: BuildActor): boolean;
  grant(userId: string, role: BuildRole): void;
  revoke(userId: string): void;
  setGuild(guildId: string | null, role?: BuildRole): void;
  transferOwner(userId: string): void;
  snapshot(): PlotPermissionSnapshot;
}

export function createPlotPermissions(config: PlotPermissionConfig): PlotPermissions {
  let ownerId = config.ownerId;
  let guildId = config.guildId;
  let guildRole = config.guildRole;
  const roles = new Map<string, BuildRole>(Object.entries(config.roles ?? {}));

  function roleOf(actor: BuildActor): BuildRole | null {
    if (actor.userId === ownerId) return "owner";
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
      return role !== null && ROLE_RANK[role] >= ROLE_RANK.editor;
    },
    canView(actor) {
      return roleOf(actor) !== null;
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
      guildRole = nextGuildId === null ? undefined : role ?? guildRole ?? "editor";
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
  };
}

export type ContributionGoal = Readonly<Record<string, number>>;

export interface ContributionResult {
  accepted: number;
  overflow: number;
  complete: boolean;
}

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
