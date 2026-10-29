import { hashString } from "@jgengine/core/random/rng";

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
  return GUEST_KINDS[hashString(id) % GUEST_KINDS.length]!;
}
