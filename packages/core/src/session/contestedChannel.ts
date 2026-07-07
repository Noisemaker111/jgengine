export type ContestedPhase = "idle" | "active" | "paused" | "contested" | "complete" | "interrupted";

export type ContestReaction = "pause" | "decay";

export interface ContestedChannelConfig {
  duration: number;
  interruptOnDamage?: boolean;
  resetOnInterrupt?: boolean;
  favorability?: Record<string, number>;
  ratePerOccupant?: boolean;
  contested?: ContestReaction;
  decayRate?: number;
}

export type ContestedEventKind = "start" | "tick" | "contested" | "paused" | "complete" | "interrupted";

export interface ContestedEvent {
  kind: ContestedEventKind;
  owner: string | null;
  progress: number;
  reason?: string;
}

export interface ContestedSnapshot {
  phase: ContestedPhase;
  progress: number;
  owner: string | null;
  remaining: number;
}

export interface ContestedChannel {
  start(team: string): ContestedEvent | null;
  tick(dt: number, occupants?: Record<string, number>): ContestedEvent[];
  damage(reason?: string): ContestedEvent | null;
  reset(): void;
  progress(): number;
  phase(): ContestedPhase;
  owner(): string | null;
  remaining(): number;
  snapshot(): ContestedSnapshot;
}

function occupantsOf(occupants: Record<string, number> | undefined, team: string): number {
  return occupants?.[team] ?? 0;
}

function anyContester(occupants: Record<string, number> | undefined, owner: string): boolean {
  if (occupants === undefined) return false;
  for (const [team, count] of Object.entries(occupants)) {
    if (team !== owner && count > 0) return true;
  }
  return false;
}

export function createContestedChannel(config: ContestedChannelConfig): ContestedChannel {
  const duration = config.duration > 0 ? config.duration : Number.EPSILON;
  const interruptOnDamage = config.interruptOnDamage ?? true;
  const resetOnInterrupt = config.resetOnInterrupt ?? false;
  const favorability = config.favorability ?? {};
  const contested = config.contested ?? "pause";
  const decayRate = config.decayRate !== undefined ? Math.abs(config.decayRate) : 1 / duration;

  let phase: ContestedPhase = "idle";
  let progress = 0;
  let owner: string | null = null;

  function fillRate(occupantCount: number): number {
    const multiplier = favorability[owner ?? ""] ?? 1;
    const scale = config.ratePerOccupant ? Math.max(1, occupantCount) : 1;
    return (multiplier * scale) / duration;
  }

  function snapshot(): ContestedSnapshot {
    return { phase, progress, owner, remaining: Math.max(0, (1 - progress) * duration) };
  }

  function emit(kind: ContestedEventKind, reason?: string): ContestedEvent {
    const event: ContestedEvent = { kind, owner, progress };
    if (reason !== undefined) event.reason = reason;
    return event;
  }

  return {
    start(team) {
      if (phase === "active" || phase === "contested" || phase === "paused") return null;
      owner = team;
      progress = phase === "interrupted" && !resetOnInterrupt ? progress : 0;
      phase = "active";
      return emit("start");
    },
    tick(dt, occupants) {
      if (dt <= 0) return [];
      if (phase !== "active" && phase !== "paused" && phase !== "contested") return [];
      if (owner === null) return [];
      const ownerCount = occupantsOf(occupants, owner);
      if (occupants !== undefined && ownerCount <= 0) {
        if (phase !== "paused") {
          phase = "paused";
          return [emit("paused", "owner-left")];
        }
        return [];
      }
      if (anyContester(occupants, owner)) {
        if (contested === "pause") {
          const changed = phase !== "contested";
          phase = "contested";
          return changed ? [emit("contested")] : [];
        }
        progress = Math.max(0, progress - decayRate * dt);
        phase = "contested";
        return [emit("contested")];
      }
      phase = "active";
      progress = Math.min(1, progress + fillRate(ownerCount) * dt);
      if (progress >= 1) {
        phase = "complete";
        return [emit("tick"), emit("complete")];
      }
      return [emit("tick")];
    },
    damage(reason) {
      if (phase !== "active" && phase !== "paused" && phase !== "contested") return null;
      if (!interruptOnDamage) return null;
      phase = "interrupted";
      if (resetOnInterrupt) progress = 0;
      return emit("interrupted", reason ?? "damage");
    },
    reset() {
      phase = "idle";
      progress = 0;
      owner = null;
    },
    progress: () => progress,
    phase: () => phase,
    owner: () => owner,
    remaining: () => Math.max(0, (1 - progress) * duration),
    snapshot,
  };
}
