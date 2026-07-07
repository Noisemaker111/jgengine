export type StorageTier = "carried" | "banked";

export interface ItemStack {
  itemId: string;
  count: number;
}

export interface ContainerSnapshot {
  inventoryId: string;
  tier: StorageTier;
  items: readonly ItemStack[];
}

export interface DeathPartition {
  kept: readonly ItemStack[];
  lost: readonly ItemStack[];
}

export function tierOf(tiers: Record<string, StorageTier>, inventoryId: string): StorageTier {
  return tiers[inventoryId] ?? "carried";
}

function mergeStacks(stacks: Iterable<ItemStack>): ItemStack[] {
  const totals = new Map<string, number>();
  for (const stack of stacks) totals.set(stack.itemId, (totals.get(stack.itemId) ?? 0) + stack.count);
  const out: ItemStack[] = [];
  for (const [itemId, count] of totals) if (count > 0) out.push({ itemId, count });
  return out;
}

export function partitionOnDeath(containers: readonly ContainerSnapshot[]): DeathPartition {
  const kept: ItemStack[] = [];
  const lost: ItemStack[] = [];
  for (const container of containers) {
    (container.tier === "banked" ? kept : lost).push(...container.items);
  }
  return { kept: mergeStacks(kept), lost: mergeStacks(lost) };
}

export interface DeliveryEntry {
  id: string;
  userId: string;
  inventoryId: string;
  items: readonly ItemStack[];
  deliverAt: number;
}

export interface ScheduledDelivery {
  userId: string;
  inventoryId: string;
  items: readonly ItemStack[];
  deliverAt: number;
}

export interface DeliveryQueue {
  schedule(entry: ScheduledDelivery & { id?: string }): DeliveryEntry;
  due(now: number): readonly DeliveryEntry[];
  claimDue(now: number): readonly DeliveryEntry[];
  pending(userId?: string): readonly DeliveryEntry[];
  cancel(id: string): boolean;
}

export function createDeliveryQueue(): DeliveryQueue {
  const entries = new Map<string, DeliveryEntry>();
  let counter = 0;
  return {
    schedule(entry) {
      const id = entry.id ?? `delivery_${(counter += 1)}`;
      const stored: DeliveryEntry = {
        id,
        userId: entry.userId,
        inventoryId: entry.inventoryId,
        items: entry.items,
        deliverAt: entry.deliverAt,
      };
      entries.set(id, stored);
      return stored;
    },
    due(now) {
      return [...entries.values()].filter((e) => e.deliverAt <= now);
    },
    claimDue(now) {
      const ready = [...entries.values()].filter((e) => e.deliverAt <= now);
      for (const entry of ready) entries.delete(entry.id);
      return ready;
    },
    pending(userId) {
      const all = [...entries.values()];
      return userId === undefined ? all : all.filter((e) => e.userId === userId);
    },
    cancel(id) {
      return entries.delete(id);
    },
  };
}

export interface InsurancePolicy {
  isInsured(itemId: string): boolean;
  returnInventoryId: string;
  delaySeconds: number | [number, number];
}

function resolveDelay(delay: number | [number, number], rng: () => number): number {
  if (typeof delay === "number") return delay;
  const [min, max] = delay;
  return min + rng() * (max - min);
}

export function insureLost(
  lost: readonly ItemStack[],
  policy: InsurancePolicy,
  userId: string,
  now: number,
  rng: () => number = Math.random,
): ScheduledDelivery | null {
  const items = lost.filter((stack) => policy.isInsured(stack.itemId));
  if (items.length === 0) return null;
  return {
    userId,
    inventoryId: policy.returnInventoryId,
    items,
    deliverAt: now + resolveDelay(policy.delaySeconds, rng),
  };
}

export interface ConsolationPolicy {
  loadoutId: string;
  when?: "always" | "if-carried-empty";
}

export function resolveConsolation(policy: ConsolationPolicy, partition: DeathPartition): { loadoutId: string } | null {
  if (policy.when === "if-carried-empty" && partition.lost.length > 0) return null;
  return { loadoutId: policy.loadoutId };
}
