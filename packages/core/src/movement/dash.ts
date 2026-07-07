export interface DashConfig {
  distance: number;
  durationMs: number;
  iframes: { fromMs: number; toMs: number };
  staminaCost: number;
  staminaMax: number;
  staminaRegenPerSecond: number;
  cooldownMs: number;
}

export interface DashDirection {
  x: number;
  z: number;
}

export type DashRejection = { reason: "no-stamina" | "cooldown" | "dashing" };

export interface DashBurst {
  direction: DashDirection;
  durationMs: number;
  distance: number;
}

export function iframeActive(config: DashConfig, elapsedMs: number): boolean {
  return elapsedMs >= config.iframes.fromMs && elapsedMs < config.iframes.toMs;
}

export function dashEase(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - (1 - clamped) * (1 - clamped);
}

export function dashOffset(config: DashConfig, dir: DashDirection, elapsedMs: number): [number, number, number] {
  const traveled = dashEase(elapsedMs / config.durationMs) * config.distance;
  const len = Math.hypot(dir.x, dir.z);
  if (len === 0) return [0, 0, 0];
  return [(dir.x / len) * traveled, 0, (dir.z / len) * traveled];
}

export interface DashState {
  tryDash(direction: DashDirection, nowMs: number): DashRejection | DashBurst;
  tick(dtSeconds: number, nowMs: number): void;
  stamina(): number;
  staminaFraction(): number;
  isDashing(nowMs: number): boolean;
  isInvulnerable(nowMs: number): boolean;
  offset(nowMs: number): [number, number, number];
}

export function createDashState(config: DashConfig): DashState {
  let stamina = config.staminaMax;
  let dashStartMs: number | null = null;
  let dashDir: DashDirection = { x: 0, z: 0 };
  let cooldownUntil = 0;

  function elapsed(nowMs: number): number | null {
    if (dashStartMs === null) return null;
    const dt = nowMs - dashStartMs;
    return dt >= 0 && dt < config.durationMs ? dt : null;
  }

  return {
    tryDash(direction, nowMs) {
      if (elapsed(nowMs) !== null) return { reason: "dashing" };
      if (nowMs < cooldownUntil) return { reason: "cooldown" };
      if (stamina < config.staminaCost) return { reason: "no-stamina" };
      stamina -= config.staminaCost;
      dashStartMs = nowMs;
      dashDir = direction;
      cooldownUntil = nowMs + config.cooldownMs;
      return { direction, durationMs: config.durationMs, distance: config.distance };
    },
    tick(dtSeconds, nowMs) {
      if (dashStartMs !== null && nowMs - dashStartMs >= config.durationMs) dashStartMs = null;
      stamina = Math.min(config.staminaMax, stamina + config.staminaRegenPerSecond * dtSeconds);
    },
    stamina() {
      return stamina;
    },
    staminaFraction() {
      return config.staminaMax <= 0 ? 0 : stamina / config.staminaMax;
    },
    isDashing(nowMs) {
      return elapsed(nowMs) !== null;
    },
    isInvulnerable(nowMs) {
      const dt = elapsed(nowMs);
      return dt !== null && iframeActive(config, dt);
    },
    offset(nowMs) {
      const dt = elapsed(nowMs);
      if (dt === null) return [0, 0, 0];
      return dashOffset(config, dashDir, dt);
    },
  };
}
