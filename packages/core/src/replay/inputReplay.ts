/** One recorded frame of play: how long it was, the actions held and newly pressed, and the look. */
export interface InputReplayFrame {
  dt: number;
  held: readonly string[];
  pressed: readonly string[];
  yaw: number;
  pitch: number;
}

/** A command a button or the shell ran, before the frame at `frame` played. */
export interface InputReplayCommand {
  frame: number;
  name: string;
  input: unknown;
}

/**
 * A session as input plus seed, plain JSON: replaying the frames and commands against a new world built
 * from the same game and seed gives the same run.
 */
export interface InputReplay {
  version: 1;
  /** The game's name, so a replay is not played against another game. */
  game: string;
  /** The world seed the run's `ctx.rng` came from; `null` when the game's default seed was used. */
  seed: string | number | null;
  frames: InputReplayFrame[];
  commands: InputReplayCommand[];
}

/** Options for {@link createInputRecorder}. */
export interface InputRecorderOptions {
  game: string;
  seed?: string | number | null;
  /** Frames kept; recording stops (and `full()` turns true) past it. Default 10 minutes at 60 fps. */
  maxFrames?: number;
}

/** Records a session's input as an {@link InputReplay}; its state is the replay itself. */
export interface InputRecorder {
  frame(frame: InputReplayFrame): void;
  command(name: string, input: unknown): void;
  /** Frames recorded so far. */
  frames(): number;
  full(): boolean;
  snapshot(): InputReplay;
  restore(replay: InputReplay): void;
  reset(): void;
}

const DEFAULT_MAX_FRAMES = 10 * 60 * 60;

/**
 * Record a session's input — each frame's time, held and pressed actions and look, and the commands run
 * between frames — against the world seed, for a deterministic replay. Bounded: it stops at `maxFrames`.
 *
 * @capability input-replay record a session as input plus seed, plain JSON, for deterministic playback
 */
export function createInputRecorder(options: InputRecorderOptions): InputRecorder {
  const maxFrames = Math.max(1, Math.floor(options.maxFrames ?? DEFAULT_MAX_FRAMES));
  let replay: InputReplay = empty();
  function empty(): InputReplay {
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

/** Why a value is not a replay, or `null` when it is one. */
export function inputReplayProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "not an object";
  const replay = value as Partial<InputReplay>;
  if (replay.version !== 1) return "version is not 1";
  if (typeof replay.game !== "string") return "no game name";
  if (!Array.isArray(replay.frames) || !Array.isArray(replay.commands)) return "no frames or commands";
  for (const frame of replay.frames) {
    if (typeof frame !== "object" || frame === null || typeof frame.dt !== "number" || !Array.isArray(frame.held)) return "a frame is not { dt, held, pressed, yaw, pitch }";
  }
  return null;
}

/** The commands recorded before frame `index`, in order, from a replay's command list. */
export function commandsAtFrame(replay: InputReplay, index: number): InputReplayCommand[] {
  return replay.commands.filter((command) => command.frame === index);
}
