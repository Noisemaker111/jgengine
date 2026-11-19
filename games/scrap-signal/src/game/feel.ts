/**
 * "This has not happened yet." Zero cannot mean it: game time also starts at zero, so on the first
 * frames of a run `now - 0` is a few milliseconds and every age-gated cue — muzzle flash, recoil,
 * damage vignette — fires at spawn before the player has done anything. A negative
 * infinity sentinel makes the age infinite instead, so a consumer that forgets to special-case
 * "never" still gets the right answer.
 */
export const NEVER_MS = Number.NEGATIVE_INFINITY;

const signals = {
  lastShotAtMs: NEVER_MS,
  lastShotFamily: "pistol",
  lastHurtAtMs: NEVER_MS,
  lastLevelUpAtMs: NEVER_MS,
};

export function noteShot(atMs: number, family: string): void {
  signals.lastShotAtMs = atMs;
  signals.lastShotFamily = family;
}

export function lastShot(): { atMs: number; family: string } {
  return { atMs: signals.lastShotAtMs, family: signals.lastShotFamily };
}

export const MUZZLE_FLASH_MS = 70;
export const RECOIL_MS = 140;

export function muzzleFlashVisible(nowMs: number): boolean {
  const since = nowMs - signals.lastShotAtMs;
  return since >= 0 && since < MUZZLE_FLASH_MS;
}

/** Recoil curve 0..1 for the viewmodel rig. Zero for a run that has not fired yet. */
export function recoilAt(nowMs: number): number {
  const since = nowMs - signals.lastShotAtMs;
  if (since < 0 || since >= RECOIL_MS) return 0;
  return Math.sin((since / RECOIL_MS) * Math.PI);
}

export function noteHurt(atMs: number): void {
  signals.lastHurtAtMs = atMs;
}

export function lastHurtAtMs(): number {
  return signals.lastHurtAtMs;
}

let lastHealth: number | null = null;

export function notePlayerHealth(nowMs: number, health: number | null): void {
  if (lastHealth !== null && health !== null && health < lastHealth) noteHurt(nowMs);
  lastHealth = health;
}

export function noteLevelUp(atMs: number): void {
  signals.lastLevelUpAtMs = atMs;
}

export function lastLevelUpAtMs(): number {
  return signals.lastLevelUpAtMs;
}

let gameNowMs = 0;

export function noteGameNow(nowMs: number): void {
  gameNowMs = nowMs;
}

export function gameNow(): number {
  return gameNowMs;
}

let equippedGunId: string | null = null;

export function noteEquipped(gunId: string | null): void {
  equippedGunId = gunId;
}

export function equippedGun(): string | null {
  return equippedGunId;
}

export function resetFeel(): void {
  equippedGunId = null;
  lastHealth = null;
  signals.lastShotAtMs = NEVER_MS;
  signals.lastHurtAtMs = NEVER_MS;
  signals.lastLevelUpAtMs = NEVER_MS;
}
