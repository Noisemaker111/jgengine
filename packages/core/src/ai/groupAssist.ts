import type { ThreatTable } from "./threat";

export interface AssistMember {
  id: string;
  groupId: string;
  table: ThreatTable;
}

export interface AssistNetworkConfig {
  radius?: number;
  shareFraction?: number;
  distanceBetween?: (a: string, b: string) => number;
}

/** Plain JSON membership of an {@link AssistNetwork}, in registration order; threat lives in each member's own table. */
export interface AssistNetworkState {
  members: { id: string; groupId: string }[];
}

export interface AssistNetwork {
  register(member: AssistMember): void;
  remove(memberId: string): void;
  memberIds(groupId?: string): string[];
  assistersOf(memberId: string): string[];
  addThreat(memberId: string, sourceId: string, amount: number): string[];
  snapshot(): AssistNetworkState;
  /** Replaces the membership; `tableOf` supplies each member's (separately restored) threat table. */
  restore(next: AssistNetworkState, tableOf: (memberId: string) => ThreatTable): void;
}

/** @internal */
export function createAssistNetwork(config: AssistNetworkConfig = {}): AssistNetwork {
  const radius = config.radius;
  const shareFraction = Math.max(0, config.shareFraction ?? 1);
  const distanceBetween = config.distanceBetween;
  const members = new Map<string, AssistMember>();
  const order: string[] = [];

  function inRange(memberId: string, otherId: string): boolean {
    if (radius === undefined || !distanceBetween) return true;
    return distanceBetween(memberId, otherId) <= radius;
  }

  return {
    register(member) {
      if (!members.has(member.id)) order.push(member.id);
      members.set(member.id, member);
    },
    remove(memberId) {
      if (!members.delete(memberId)) return;
      const index = order.indexOf(memberId);
      if (index !== -1) order.splice(index, 1);
    },
    memberIds(groupId) {
      if (groupId === undefined) return [...order];
      return order.filter((id) => members.get(id)!.groupId === groupId);
    },
    assistersOf(memberId) {
      const member = members.get(memberId);
      if (!member) return [];
      return order.filter((id) => {
        if (id === memberId) return false;
        const other = members.get(id)!;
        return other.groupId === member.groupId && inRange(memberId, id);
      });
    },
    addThreat(memberId, sourceId, amount) {
      const member = members.get(memberId);
      if (!member || amount <= 0) return [];
      member.table.add(sourceId, amount);
      if (shareFraction <= 0) return [];
      const assisters = order.filter((id) => {
        if (id === memberId) return false;
        const other = members.get(id)!;
        return other.groupId === member.groupId && inRange(memberId, id);
      });
      for (const id of assisters) members.get(id)!.table.add(sourceId, amount * shareFraction);
      return assisters;
    },
    snapshot() {
      return { members: order.map((id) => ({ id, groupId: members.get(id)!.groupId })) };
    },
    restore(next, tableOf) {
      members.clear();
      order.length = 0;
      for (const { id, groupId } of next.members) {
        order.push(id);
        members.set(id, { id, groupId, table: tableOf(id) });
      }
    },
  };
}
