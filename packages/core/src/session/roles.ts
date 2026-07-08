import { shuffleWithRng } from "../cards/cardPile";

export interface RoleSpec {
  id: string;
  count?: number;
  ratio?: number;
}

export function assignRoles(
  userIds: readonly string[],
  roles: readonly RoleSpec[],
  rng: () => number = Math.random,
): Record<string, string> {
  if (roles.length === 0) throw new Error("assignRoles needs at least one role");
  const shuffled = shuffleWithRng(userIds, rng);
  const assignment: Record<string, string> = {};
  let index = 0;

  const countRoles = roles.filter((role) => role.count !== undefined);
  const ratioRoles = roles.filter((role) => role.count === undefined && role.ratio !== undefined);
  const fillRole = roles.find((role) => role.count === undefined && role.ratio === undefined);
  const fallbackRole = fillRole ?? roles[roles.length - 1]!;

  for (const role of countRoles) {
    const take = Math.max(0, Math.min(role.count!, shuffled.length - index));
    for (let i = 0; i < take; i += 1) {
      assignment[shuffled[index]!] = role.id;
      index += 1;
    }
  }

  for (const role of ratioRoles) {
    const wanted = Math.round(role.ratio! * shuffled.length);
    const take = Math.max(0, Math.min(wanted, shuffled.length - index));
    for (let i = 0; i < take; i += 1) {
      assignment[shuffled[index]!] = role.id;
      index += 1;
    }
  }

  while (index < shuffled.length) {
    assignment[shuffled[index]!] = fallbackRole.id;
    index += 1;
  }

  return assignment;
}
