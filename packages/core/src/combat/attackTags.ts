export type AttackTag =
  | "unblockable"
  | "thrust"
  | "sweep"
  | "grab"
  | "overhead"
  | "ranged"
  | "aerial";

export interface AttackMeta {
  tags: readonly AttackTag[];
  effect?: string;
  power?: number;
}

export function attackMeta(tags: readonly AttackTag[], extra?: Omit<AttackMeta, "tags">): AttackMeta {
  return { tags, ...extra };
}

export function hasTag(meta: AttackMeta, tag: AttackTag): boolean {
  return meta.tags.includes(tag);
}

export function hasAnyTag(meta: AttackMeta, tags: readonly AttackTag[]): boolean {
  return tags.some((tag) => meta.tags.includes(tag));
}

export function isBlockable(meta: AttackMeta): boolean {
  return !hasAnyTag(meta, ["unblockable", "grab"]);
}

export function isParryable(meta: AttackMeta): boolean {
  return !hasTag(meta, "grab");
}

export function isDodgeable(meta: AttackMeta): boolean {
  return !hasTag(meta, "grab");
}

export type CounterMove = "mikiri" | "deflect" | "sidestep";

const COUNTER_TAGS: Record<CounterMove, AttackTag> = {
  mikiri: "thrust",
  deflect: "overhead",
  sidestep: "sweep",
};

export function counters(meta: AttackMeta, move: CounterMove): boolean {
  return hasTag(meta, COUNTER_TAGS[move]);
}
