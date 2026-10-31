import type { GameCaptureConfig, ProbeReadings } from "@jgengine/core/game/playableGame";
import type { HeadlessPlayable } from "@jgengine/core/runtime/headlessRunner";
import type { ReplayRecording } from "@jgengine/core/replay/replayRecording";

import { createPlaySession, type PlaySession } from "@jgengine/core/play/playSession.draw";

/** What a replay played to. */
export interface ReplayPlayback {
  session: PlaySession;
  frames: number;
  /** The game's probe after the last frame, when it has one. */
  probe: ProbeReadings | undefined;
}

type ReplayPlayable = HeadlessPlayable & { capture?: GameCaptureConfig<ProbeReadings> | undefined };

/** Boot the way New game does for a capture: the game's `capture.play` commands. */
function bootNewGame(session: PlaySession, capture: GameCaptureConfig<ProbeReadings> | undefined): void {
  for (const entry of capture?.play ?? []) {
    const name = typeof entry === "string" ? entry : entry.name;
    session.command(name, typeof entry === "string" ? {} : (entry.input ?? {}), `boot ${name}`);
  }
}

/**
 * Play an {@link ReplayRecording} headless against a new world from the same game and seed: boot a new game
 * (unless `boot: false`), then each frame's commands, look and held actions at the frame's own time.
 * The same replay always reaches the same state, so a recorded session is a repro anyone can run.
 *
 * @capability replay-playback play a recorded input-plus-seed session headless and reach the same state
 */
export function playReplayRecording(playable: ReplayPlayable, replay: ReplayRecording, options: { boot?: boolean } = {}): ReplayPlayback {
  if (replay.game !== playable.game.name) throw new Error(`replay is of "${replay.game}", not "${playable.game.name}"`);
  const session = createPlaySession(playable, replay.seed === null ? {} : { seed: replay.seed });
  if (options.boot !== false) bootNewGame(session, playable.capture);
  const commands = [...replay.commands].sort((a, b) => a.frame - b.frame);
  let next = 0;
  const runDue = (frame: number): void => {
    for (let command = commands[next]; command !== undefined && command.frame <= frame; command = commands[next]) {
      next += 1;
      session.command(command.name, command.input, `replay ${command.name}`);
    }
  };
  replay.frames.forEach((frame, index) => {
    runDue(index);
    session.runner.aim({ heading: frame.yaw, pitch: frame.pitch });
    session.tick(frame.held, frame.dt);
  });
  runDue(Number.POSITIVE_INFINITY);
  return { session, frames: replay.frames.length, probe: playable.capture?.probe?.(session.ctx) };
}
