export interface ReplayFrame {
  dt: number;
  held: readonly string[];
  pressed: readonly string[];
  yaw: number;
  pitch: number;
}

/** A command a button or the shell ran, before the frame at `frame` played. */
export interface ReplayCommand {
  frame: number;
  name: string;
  input: unknown;
}

export interface ReplayRecording {
  version: 1;
  /** The game's name, so a replay is not played against another game. */
  game: string;
  seed: string | number | null;
  frames: ReplayFrame[];
  commands: ReplayCommand[];
}

export interface ReplayRecorderOptions {
  game: string;
  seed?: string | number | null;
  /** Frames kept; recording stops (and `full()` turns true) past it. Default 10 minutes at 60 fps. */
  maxFrames?: number;
}

export interface ReplayRecorder {
  frame(frame: ReplayFrame): void;
  command(name: string, input: unknown): void;
  frames(): number;
  full(): boolean;
  snapshot(): ReplayRecording;
  restore(replay: ReplayRecording): void;
  reset(): void;
}

const DEFAULT_MAX_FRAMES = 10 * 60 * 60;

/**
 * Record a session's input — each frame's time, held and pressed actions and look, and the commands run
 * between frames — against the world seed, for a deterministic replay. Bounded: it stops at `maxFrames`.
 *
 * @capability replay-recording record a session as input plus seed, plain JSON, for deterministic playback
 */
export function createReplayRecorder(options: ReplayRecorderOptions): ReplayRecorder {
  const maxFrames = Math.max(1, Math.floor(options.maxFrames ?? DEFAULT_MAX_FRAMES));
  let replay: ReplayRecording = empty();
  function empty(): ReplayRecording {
    return { version: 1, game: options.game, seed: options.seed ?? null, frames: [], commands: [] };
  }
  return {
    frame(frame) {
      if (replay.frames.length >= maxFrames) return;
      replay.frames.push({ dt: frame.dt, held: [...frame.held], pressed: [...frame.pressed], yaw: frame.yaw, pitch: frame.pitch });
    },
    command(name, input) {
      if (replay.frames.length >= maxFrames) return;
      replay.commands.push({ frame: replay.frames.length, name, input: input === undefined ? null : structuredClone(input) });
    },
    frames: () => replay.frames.length,
    full: () => replay.frames.length >= maxFrames,
    snapshot: () => structuredClone(replay),
    restore(next) {
      replay = structuredClone(next);
    },
    reset() {
      replay = empty();
    },
  };
}

function field(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

/**
 * Why a value (a parsed replay file) is not a {@link ReplayRecording}, or `null` when it is one.
 *
 * @capability replay-recording-check say why a loaded file is not a replay recording before playing it
 */
export function replayRecordingProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "not an object";
  if (field(value, "version") !== 1) return "version is not 1";
  if (typeof field(value, "game") !== "string") return "no game name";
  const frames = field(value, "frames");
  if (!Array.isArray(frames) || !Array.isArray(field(value, "commands"))) return "no frames or commands";
  for (const frame of frames) {
    if (typeof frame !== "object" || frame === null || typeof field(frame, "dt") !== "number" || !Array.isArray(field(frame, "held"))) return "a frame is not { dt, held, pressed, yaw, pitch }";
  }
  return null;
}

declare module "../runtime/pageHandle" {
  interface JgPage {
    replay?: ReplayRecording;
  }
}
