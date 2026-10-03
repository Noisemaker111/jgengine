/** One reserved playback slot, including sources still loading. */
export interface AudioVoice {
  id: number;
  soundId: string;
  priority: number;
}

/** Detached allocator state; ids increase monotonically for deterministic oldest-first ties. */
export interface VoiceAllocatorSnapshot {
  nextId: number;
  voices: AudioVoice[];
}

/** Caller-owned reservation storage. Reads and writes use detached state. */
export interface VoiceAllocatorStorage {
  read(): VoiceAllocatorSnapshot;
  write(state: VoiceAllocatorSnapshot): void;
}

/** Playback budget. Zero disables playback; default 64. */
export interface VoiceAllocatorConfig {
  maxTotal?: number;
  /** At capacity, steal the lowest-priority oldest voice, or reject new voices. Default "steal-lowest". */
  overflow?: "steal-lowest" | "reject";
  storage?: VoiceAllocatorStorage;
}

/** Admission result; stop every stolen source before starting the admitted voice. */
export type VoiceAllocation = { ok: false } | { ok: true; voiceId: number; stolen: number[] };

/** Bounded reservations with higher-priority protection and oldest-first ties. */
export interface VoiceAllocator {
  request(soundId: string, priority?: number, maxVoices?: number): VoiceAllocation;
  release(voiceId: number): void;
  snapshot(): VoiceAllocatorSnapshot;
  restore(state: VoiceAllocatorSnapshot): void;
  /** Return reservations removed to meet the new limit; the playback owner stops them. */
  retune(config: Pick<VoiceAllocatorConfig, "maxTotal" | "overflow">): number[];
}

function limit(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("Voice limit must be finite and nonnegative");
  return Math.floor(value);
}

function copy(state: VoiceAllocatorSnapshot): VoiceAllocatorSnapshot {
  return { nextId: state.nextId, voices: state.voices.map((voice) => ({ ...voice })) };
}

function weakest(voices: AudioVoice[]): AudioVoice[] {
  return [...voices].sort((a, b) => a.priority - b.priority || a.id - b.id);
}

/**
 * Reserve bounded sound playback before fetching or constructing a graph. Equal priorities steal
 * the oldest reservation; lower priorities cannot interrupt higher priorities. Policy is retunable.
 * @capability audio-voice-budget bound simultaneous sound playback with per-sound caps, priorities, and deterministic stealing
 */
export function createVoiceAllocator(config: VoiceAllocatorConfig = {}): VoiceAllocator {
  let maxTotal = limit(config.maxTotal ?? 64);
  let overflow = config.overflow ?? "steal-lowest";
  let memory: VoiceAllocatorSnapshot = { nextId: 1, voices: [] };
  const storage = config.storage ?? { read: () => memory, write: (next: VoiceAllocatorSnapshot) => { memory = next; } };
  function snapshot(): VoiceAllocatorSnapshot { return copy(storage.read()); }
  function restore(state: VoiceAllocatorSnapshot): void {
    const ids = new Set<number>();
    if (!Number.isSafeInteger(state.nextId) || state.nextId < 1 || state.voices.length > maxTotal) throw new RangeError("Invalid voice state");
    for (const voice of state.voices) {
      if (!Number.isSafeInteger(voice.id) || voice.id < 1 || voice.id >= state.nextId || ids.has(voice.id) || !Number.isFinite(voice.priority)) throw new RangeError("Invalid voice state");
      ids.add(voice.id);
    }
    storage.write(copy(state));
  }
  restore(snapshot());
  return {
    snapshot, restore,
    request(soundId, priority = 0, maxVoices = maxTotal) {
      if (!Number.isFinite(priority)) throw new RangeError("Voice priority must be finite");
      const soundLimit = limit(maxVoices);
      if (maxTotal === 0 || soundLimit === 0) return { ok: false };
      const state = snapshot();
      const same = weakest(state.voices.filter((voice) => voice.soundId === soundId));
      const victims = same.slice(0, Math.max(0, same.length - soundLimit + 1));
      const selected = new Set(victims.map((voice) => voice.id));
      const remaining = weakest(state.voices.filter((voice) => !selected.has(voice.id)));
      victims.push(...remaining.slice(0, Math.max(0, state.voices.length - victims.length - maxTotal + 1)));
      if ((overflow === "reject" && victims.length > 0) || victims.some((voice) => voice.priority > priority)) return { ok: false };
      const stolen = victims.map((voice) => voice.id);
      const removed = new Set(stolen);
      const voiceId = state.nextId++;
      state.voices = state.voices.filter((voice) => !removed.has(voice.id));
      state.voices.push({ id: voiceId, soundId, priority });
      restore(state);
      return { ok: true, voiceId, stolen };
    },
    release(voiceId) {
      const state = snapshot();
      state.voices = state.voices.filter((voice) => voice.id !== voiceId);
      restore(state);
    },
    retune(next) {
      const nextLimit = limit(next.maxTotal ?? maxTotal);
      const state = snapshot();
      const removed = weakest(state.voices).slice(0, Math.max(0, state.voices.length - nextLimit)).map((voice) => voice.id);
      const ids = new Set(removed);
      state.voices = state.voices.filter((voice) => !ids.has(voice.id));
      maxTotal = nextLimit;
      overflow = next.overflow ?? overflow;
      restore(state);
      return removed;
    },
  };
}
