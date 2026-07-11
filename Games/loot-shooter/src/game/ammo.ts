import type { AmmoPool } from "./items/weapons/catalog";

export const AMMO_STAT_IDS: Record<AmmoPool, string> = {
  light: "ammo_light",
  heavy: "ammo_heavy",
  shell: "ammo_shell",
  energy: "ammo_energy",
};

export const AMMO_LABELS: Record<AmmoPool, string> = {
  light: "Light",
  heavy: "Heavy",
  shell: "Shell",
  energy: "Cell",
};

export const AMMO_START: Record<AmmoPool, { max: number; current: number }> = {
  light: { max: 300, current: 120 },
  heavy: { max: 240, current: 60 },
  shell: { max: 80, current: 16 },
  energy: { max: 200, current: 0 },
};

export const AMMO_POOLS: readonly AmmoPool[] = ["light", "heavy", "shell", "energy"];
