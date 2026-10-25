export const GUEST_WALK_SPEED = 4.2;

export const GUEST_SCALE = 0.9;

export const GUEST_KINDS: readonly string[] = [
  "guest_a",
  "guest_b",
  "guest_c",
  "guest_d",
  "guest_e",
];

export function guestKindFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return GUEST_KINDS[hash % GUEST_KINDS.length]!;
}
