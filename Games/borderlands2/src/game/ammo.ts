export type AmmoPool = "pistol" | "smg" | "shotgun" | "rifle" | "sniper" | "rocket";

export const AMMO_STAT_IDS: Record<AmmoPool, string> = {
  pistol: "ammo_pistol",
  smg: "ammo_smg",
  shotgun: "ammo_shotgun",
  rifle: "ammo_rifle",
  sniper: "ammo_sniper",
  rocket: "ammo_rocket",
};

export const AMMO_LABELS: Record<AmmoPool, string> = {
  pistol: "Pistol",
  smg: "SMG",
  shotgun: "Shotgun",
  rifle: "Rifle",
  sniper: "Sniper",
  rocket: "Rocket",
};

export const AMMO_START: Record<AmmoPool, { max: number; current: number }> = {
  pistol: { max: 200, current: 80 },
  smg: { max: 360, current: 120 },
  shotgun: { max: 80, current: 20 },
  rifle: { max: 280, current: 0 },
  sniper: { max: 48, current: 0 },
  rocket: { max: 12, current: 0 },
};

export const AMMO_POOLS: readonly AmmoPool[] = ["pistol", "smg", "shotgun", "rifle", "sniper", "rocket"];
