export const GUEST_ID = "guest";

export const GUEST_WALK_SPEED = 4.2;

export const GUEST_SCALE = 0.9;

export const GUEST_COLORS: readonly string[] = [
  "#e2483d",
  "#e8842a",
  "#f0c53a",
  "#4fb04a",
  "#2f9fd0",
  "#3f63d8",
  "#8a5cd0",
  "#e85fa0",
  "#2fb37a",
  "#d95d5d",
];

export const GUEST_SKINS: readonly string[] = ["#f2c9a0", "#e0a878", "#c08858", "#8a5a38"];

export function guestColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return GUEST_COLORS[hash % GUEST_COLORS.length]!;
}

export function guestSkin(id: string): string {
  let hash = 7;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 17 + id.charCodeAt(i)) >>> 0;
  return GUEST_SKINS[hash % GUEST_SKINS.length]!;
}
