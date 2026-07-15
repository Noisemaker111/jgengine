export interface HitSignal {
  atMs: number;
  crit: boolean;
  kill: boolean;
}

const signals = {
  lastShotAtMs: 0,
  lastShotFamily: "pistol",
  lastHit: { atMs: 0, crit: false, kill: false } as HitSignal,
  lastHurtAtMs: 0,
  lastLevelUpAtMs: 0,
};

export function noteShot(atMs: number, family: string): void {
  signals.lastShotAtMs = atMs;
  signals.lastShotFamily = family;
}

export function lastShot(): { atMs: number; family: string } {
  return { atMs: signals.lastShotAtMs, family: signals.lastShotFamily };
}

export function noteHit(atMs: number, crit: boolean, kill: boolean): void {
  signals.lastHit = { atMs, crit, kill };
}

export function lastHit(): HitSignal {
  return signals.lastHit;
}

export function noteHurt(atMs: number): void {
  signals.lastHurtAtMs = atMs;
}

export function lastHurtAtMs(): number {
  return signals.lastHurtAtMs;
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
  signals.lastShotAtMs = 0;
  signals.lastHit = { atMs: 0, crit: false, kill: false };
  signals.lastHurtAtMs = 0;
  signals.lastLevelUpAtMs = 0;
}
