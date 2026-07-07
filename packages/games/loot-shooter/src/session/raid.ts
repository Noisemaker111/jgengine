import { createDownedState, type DownedPhase } from "@jgengine/core/combat/downed";
import { createRaidSession } from "@jgengine/core/session/extraction";
import { createRing, type RingConfig } from "@jgengine/core/session/ring";

export interface RingHud {
  timeToShrink: number;
  shrinking: boolean;
  radius: number;
  outside: boolean;
}

export interface DownedHud {
  phase: DownedPhase;
  bleedoutRemaining: number;
  bleedoutMax: number;
  reviveProgress: number;
  reviveSeconds: number;
}

export interface ExtractionHud {
  extractId: string;
  progress: number;
  remaining: number;
}

export interface SessionHud {
  ring: RingHud | null;
  downed: DownedHud | null;
  extraction: ExtractionHud | null;
}

const EMPTY: SessionHud = { ring: null, downed: null, extraction: null };

function createSessionHudStore() {
  let state: SessionHud = EMPTY;
  const listeners = new Set<(next: SessionHud) => void>();
  return {
    getState: () => state,
    subscribe(listener: (next: SessionHud) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: SessionHud) {
      state = next;
      for (const listener of listeners) listener(state);
    },
  };
}

export const sessionHud = createSessionHudStore();

export const RING_CONFIG: RingConfig = {
  center: [0, 0],
  phases: [
    { startTime: 20, shrinkDuration: 30, fromRadius: 120, toRadius: 70, damagePerSecond: 2 },
    { startTime: 70, shrinkDuration: 30, fromRadius: 70, toRadius: 30, damagePerSecond: 5 },
  ],
};

export const BLEEDOUT_SECONDS = 45;
export const REVIVE_SECONDS = 5;

export const ring = createRing(RING_CONFIG);

export const downed = createDownedState({
  bleedoutSeconds: BLEEDOUT_SECONDS,
  reviveSeconds: REVIVE_SECONDS,
  reviveHealthFraction: 0.4,
  banner: { expireSeconds: 90 },
});

export const raid = createRaidSession({
  extracts: [{ id: "heli_pad", center: [40, 0], radius: 6, holdSeconds: 8 }],
  insurance: { isInsured: () => true, returnInventoryId: "stash", delaySeconds: 3600 },
  consolation: { loadoutId: "starterKit" },
});

function timeToShrink(now: number): { timeToShrink: number; shrinking: boolean } {
  for (const phase of RING_CONFIG.phases) {
    if (now < phase.startTime) return { timeToShrink: phase.startTime - now, shrinking: false };
    if (now < phase.startTime + phase.shrinkDuration) return { timeToShrink: 0, shrinking: true };
  }
  return { timeToShrink: 0, shrinking: false };
}

export function ringHudAt(now: number, playerPos: [number, number]): RingHud {
  const sample = ring.at(now);
  const { timeToShrink: tts, shrinking } = timeToShrink(now);
  return {
    timeToShrink: tts,
    shrinking,
    radius: sample.radius,
    outside: ring.isOutside(now, playerPos),
  };
}

export function publishHud(next: Partial<SessionHud>): void {
  sessionHud.set({ ...sessionHud.getState(), ...next });
}

export function stagePreview(): void {
  sessionHud.set({
    ring: { timeToShrink: 12, shrinking: false, radius: 120, outside: false },
    downed: {
      phase: "downed",
      bleedoutRemaining: 31,
      bleedoutMax: BLEEDOUT_SECONDS,
      reviveProgress: 2.6,
      reviveSeconds: REVIVE_SECONDS,
    },
    extraction: { extractId: "heli_pad", progress: 0.62, remaining: 3.0 },
  });
}
