import type { DeathReason, EntityDiedEvent, GameEvents } from "../game/events";
import type { Drop } from "../game/lootTable";
import type { EffectVia } from "./effects";

export type DeathReasonKind = DeathReason["kind"];

export interface OnDeathDropRule {
  table: string;
  when?: { reason: DeathReasonKind };
}

export interface OnDeathCommandRule {
  name: string;
  args?: unknown;
  when?: { reason: DeathReasonKind };
}

export interface OnDeathSpec {
  drops?: string | OnDeathDropRule[];
  command?: string | OnDeathCommandRule;
}

export interface NormalizedOnDeath {
  drops: OnDeathDropRule[];
  command: OnDeathCommandRule | null;
}

export function normalizeOnDeath(spec: OnDeathSpec | null | undefined): NormalizedOnDeath {
  if (!spec) return { drops: [], command: null };
  const drops =
    spec.drops === undefined ? [] : typeof spec.drops === "string" ? [{ table: spec.drops }] : spec.drops;
  const command =
    spec.command === undefined ? null : typeof spec.command === "string" ? { name: spec.command } : spec.command;
  return { drops, command };
}

export interface DeathIdentity {
  catalogId: string;
  userId?: string;
  displayName?: string;
  position: [number, number, number];
}

export interface DeathSystemDeps {
  resolveOnDeath(instanceId: string): OnDeathSpec | null | undefined;
  resolveIdentity(instanceId: string): DeathIdentity | null;
  loot: { roll(tableId: string): Drop[] };
  events: GameEvents;
  runCommand?(name: string, args: unknown): void;
  despawn(instanceId: string): void;
}

export type DeathResolution =
  | { status: "resolved"; drops: Drop[]; ranCommand: string | null }
  | { status: "rejected"; reason: string };

export interface DeathSystem {
  resolveDeath(instanceId: string, reason: DeathReason): DeathResolution;
  revive(instanceId: string): boolean;
}

function matchesReason(when: { reason: DeathReasonKind } | undefined, reason: DeathReason): boolean {
  return when === undefined || when.reason === reason.kind;
}

export function createDeathSystem(deps: DeathSystemDeps): DeathSystem {
  const dead = new Set<string>();

  return {
    resolveDeath(instanceId, reason) {
      if (dead.has(instanceId)) return { status: "rejected", reason: "already-dead" };
      const identity = deps.resolveIdentity(instanceId);
      if (identity === null) return { status: "rejected", reason: "unknown-instance" };
      dead.add(instanceId);
      const event: EntityDiedEvent = {
        instanceId,
        catalogId: identity.catalogId,
        reason,
        position: identity.position,
      };
      if (identity.userId !== undefined) event.userId = identity.userId;
      if (identity.displayName !== undefined) event.displayName = identity.displayName;
      deps.events.emit("entity.died", event);
      const onDeath = normalizeOnDeath(deps.resolveOnDeath(instanceId));
      const drops: Drop[] = [];
      for (const rule of onDeath.drops) {
        if (matchesReason(rule.when, reason)) drops.push(...deps.loot.roll(rule.table));
      }
      let ranCommand: string | null = null;
      if (
        onDeath.command !== null &&
        matchesReason(onDeath.command.when, reason) &&
        deps.runCommand !== undefined
      ) {
        deps.runCommand(onDeath.command.name, onDeath.command.args);
        ranCommand = onDeath.command.name;
      }
      deps.despawn(instanceId);
      return { status: "resolved", drops, ranCommand };
    },
    revive(instanceId) {
      return dead.delete(instanceId);
    },
  };
}

export interface EffectDeathContext {
  from: string;
  via?: EffectVia;
  userIdOf?(instanceId: string): string | undefined;
}

export function deathReasonFromEffect(ctx: EffectDeathContext): DeathReason {
  const killerUserId = ctx.userIdOf?.(ctx.from);
  if (killerUserId !== undefined) {
    return ctx.via?.item !== undefined
      ? { kind: "player_kill", killerUserId, via: { item: ctx.via.item } }
      : { kind: "player_kill", killerUserId };
  }
  return { kind: "environment", source: ctx.via?.item ?? "effect" };
}
