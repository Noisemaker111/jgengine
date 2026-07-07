import { type AttackMeta, isBlockable, isDodgeable, isParryable } from "./attackTags";

export type DefenseKind = "parry" | "block" | "dodge";

export interface DefensiveWindowConfig {
  kind: DefenseKind;
  startupMs?: number;
  activeMs: number;
  recoveryMs?: number;
  iframes?: { fromMs: number; toMs: number };
}

export type DefenseOutcome = "parry" | "block" | "iframe" | "hit";

export interface DefenseResolution {
  outcome: DefenseOutcome;
  perfect: boolean;
}

export function windowActiveAt(config: DefensiveWindowConfig, elapsedMs: number): boolean {
  const start = config.startupMs ?? 0;
  return elapsedMs >= start && elapsedMs < start + config.activeMs;
}

export function iframeActiveAt(config: DefensiveWindowConfig, elapsedMs: number): boolean {
  const frames = config.iframes;
  if (frames === undefined) return false;
  return elapsedMs >= frames.fromMs && elapsedMs < frames.toMs;
}

export function totalWindowMs(config: DefensiveWindowConfig): number {
  return (config.startupMs ?? 0) + config.activeMs + (config.recoveryMs ?? 0);
}

export interface ResolveDefenseInput {
  config: DefensiveWindowConfig;
  elapsedMs: number;
  attack: AttackMeta;
}

export function resolveDefense(input: ResolveDefenseInput): DefenseResolution {
  const { config, elapsedMs, attack } = input;
  const inWindow = windowActiveAt(config, elapsedMs);
  const inIframe = iframeActiveAt(config, elapsedMs);

  if (config.kind === "dodge") {
    if (inIframe && isDodgeable(attack)) return { outcome: "iframe", perfect: inWindow };
    return { outcome: "hit", perfect: false };
  }

  if (config.kind === "parry") {
    if (inWindow && isParryable(attack)) return { outcome: "parry", perfect: true };
    if (inIframe && isDodgeable(attack)) return { outcome: "iframe", perfect: false };
    return { outcome: "hit", perfect: false };
  }

  if (inWindow && isBlockable(attack)) return { outcome: "block", perfect: true };
  return { outcome: "hit", perfect: false };
}

export interface DefensiveWindow {
  open(nowMs: number): void;
  close(): void;
  isOpen(): boolean;
  evaluate(nowMs: number, attack: AttackMeta): DefenseResolution;
  isInvulnerable(nowMs: number): boolean;
}

export function createDefensiveWindow(config: DefensiveWindowConfig): DefensiveWindow {
  let openedAt: number | null = null;

  function elapsed(nowMs: number): number | null {
    if (openedAt === null) return null;
    const dt = nowMs - openedAt;
    if (dt < 0 || dt >= totalWindowMs(config)) return null;
    return dt;
  }

  return {
    open(nowMs) {
      openedAt = nowMs;
    },
    close() {
      openedAt = null;
    },
    isOpen() {
      return openedAt !== null;
    },
    evaluate(nowMs, attack) {
      const dt = elapsed(nowMs);
      if (dt === null) return { outcome: "hit", perfect: false };
      return resolveDefense({ config, elapsedMs: dt, attack });
    },
    isInvulnerable(nowMs) {
      const dt = elapsed(nowMs);
      return dt !== null && iframeActiveAt(config, dt);
    },
  };
}
