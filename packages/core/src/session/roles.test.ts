import { describe, expect, test } from "bun:test";
import { pileRng } from "@jgengine/core/cards/cardPile";
import { assignRoles, type RoleSpec } from "@jgengine/core/session/roles";

function counts(assignment: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const roleId of Object.values(assignment)) out[roleId] = (out[roleId] ?? 0) + 1;
  return out;
}

const USERS = ["u1", "u2", "u3", "u4", "u5"];

describe("assignRoles", () => {
  test("throws when there are no roles", () => {
    expect(() => assignRoles(USERS, [], pileRng(1))).toThrow();
  });

  test("assigns exact counts before anything else", () => {
    const roles: RoleSpec[] = [{ id: "leader", count: 1 }, { id: "member", count: 2 }];
    const assignment = assignRoles(["a", "b", "c"], roles, pileRng(7));
    expect(counts(assignment)).toEqual({ leader: 1, member: 2 });
  });

  test("ratio roles round to the nearest whole player, capped by what remains", () => {
    const roles: RoleSpec[] = [{ id: "team-a", ratio: 0.5 }, { id: "team-b", ratio: 0.5 }];
    const assignment = assignRoles(USERS, roles, pileRng(3));
    const tally = counts(assignment);
    expect(tally["team-a"]! + tally["team-b"]!).toBe(5);
    expect(tally["team-a"]).toBe(3);
    expect(tally["team-b"]).toBe(2);
  });

  test("remaining users land on the fill role (no count, no ratio)", () => {
    const roles: RoleSpec[] = [{ id: "vip", count: 1 }, { id: "guest" }];
    const assignment = assignRoles(["a", "b", "c", "d"], roles, pileRng(11));
    expect(counts(assignment)).toEqual({ vip: 1, guest: 3 });
  });

  test("with no fill role, the remainder goes to the last role", () => {
    const roles: RoleSpec[] = [{ id: "a", count: 1 }, { id: "b", count: 1 }];
    const assignment = assignRoles(USERS, roles, pileRng(11));
    expect(counts(assignment)).toEqual({ a: 1, b: 4 });
  });

  test("is deterministic for a fixed seed", () => {
    const roles: RoleSpec[] = [{ id: "leader", count: 1 }, { id: "member" }];
    const first = assignRoles(USERS, roles, pileRng("match-42"));
    const second = assignRoles(USERS, roles, pileRng("match-42"));
    expect(first).toEqual(second);
  });

  test("caps an explicit count that exceeds the player pool", () => {
    const roles: RoleSpec[] = [{ id: "everyone", count: 10 }];
    const assignment = assignRoles(["a", "b", "c"], roles, pileRng(2));
    expect(counts(assignment)).toEqual({ everyone: 3 });
  });
});
