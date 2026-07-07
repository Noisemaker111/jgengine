export type FramePhase = "windup" | "active" | "recovery" | "cancel";

export interface FrameRange {
  phase: FramePhase;
  from: number;
  to: number;
}

export interface AnimationClip {
  id: string;
  frames: number;
  fps: number;
  ranges: readonly FrameRange[];
  loop?: boolean;
}

export interface AnimationSnapshot {
  clipId: string;
  frame: number;
  elapsedMs: number;
}

export interface AnimationTickResult {
  clipId: string | null;
  frame: number;
  entered: readonly FramePhase[];
  exited: readonly FramePhase[];
  completed: boolean;
}

export function clipDurationMs(clip: AnimationClip): number {
  return (clip.frames / clip.fps) * 1000;
}

export function frameAtMs(clip: AnimationClip, elapsedMs: number): number {
  const raw = (elapsedMs / 1000) * clip.fps;
  if (clip.loop === true) {
    const wrapped = raw % clip.frames;
    return wrapped < 0 ? wrapped + clip.frames : wrapped;
  }
  return Math.min(raw, clip.frames);
}

export function phasesAtFrame(clip: AnimationClip, frame: number): FramePhase[] {
  const phases: FramePhase[] = [];
  for (const range of clip.ranges) {
    if (frame >= range.from && frame < range.to && !phases.includes(range.phase)) {
      phases.push(range.phase);
    }
  }
  return phases;
}

export function activeRangeAtFrame(clip: AnimationClip, frame: number): FrameRange | null {
  for (const range of clip.ranges) {
    if (range.phase === "active" && frame >= range.from && frame < range.to) return range;
  }
  return null;
}

export interface AnimationState {
  play(clipId: string): void;
  stop(): void;
  tick(dtSeconds: number): AnimationTickResult;
  current(): AnimationSnapshot | null;
  phases(): readonly FramePhase[];
  inPhase(phase: FramePhase): boolean;
  isActive(): boolean;
  canCancel(): boolean;
  activeWindowMs(): { from: number; to: number } | null;
}

export interface AnimationStateConfig {
  clips: readonly AnimationClip[];
}

export function createAnimationState(config: AnimationStateConfig): AnimationState {
  const clips = new Map(config.clips.map((clip) => [clip.id, clip]));

  let activeClip: AnimationClip | null = null;
  let elapsedMs = 0;
  let lastPhases: FramePhase[] = [];

  function frame(): number {
    return activeClip === null ? 0 : frameAtMs(activeClip, elapsedMs);
  }

  return {
    play(clipId) {
      const clip = clips.get(clipId);
      if (clip === undefined) return;
      activeClip = clip;
      elapsedMs = 0;
      lastPhases = phasesAtFrame(clip, 0);
    },
    stop() {
      activeClip = null;
      elapsedMs = 0;
      lastPhases = [];
    },
    tick(dtSeconds) {
      if (activeClip === null) {
        return { clipId: null, frame: 0, entered: [], exited: [], completed: false };
      }
      elapsedMs += dtSeconds * 1000;
      const clip = activeClip;
      let completed = false;
      if (clip.loop !== true && elapsedMs >= clipDurationMs(clip)) {
        elapsedMs = clipDurationMs(clip);
        completed = true;
      }
      const currentFrame = frameAtMs(clip, elapsedMs);
      const nowPhases = phasesAtFrame(clip, currentFrame);
      const entered = nowPhases.filter((p) => !lastPhases.includes(p));
      const exited = lastPhases.filter((p) => !nowPhases.includes(p));
      lastPhases = nowPhases;
      const clipId = clip.id;
      if (completed) {
        activeClip = null;
        elapsedMs = 0;
        lastPhases = [];
      }
      return { clipId, frame: currentFrame, entered, exited, completed };
    },
    current() {
      if (activeClip === null) return null;
      return { clipId: activeClip.id, frame: frame(), elapsedMs };
    },
    phases() {
      return activeClip === null ? [] : phasesAtFrame(activeClip, frame());
    },
    inPhase(phase) {
      return activeClip !== null && phasesAtFrame(activeClip, frame()).includes(phase);
    },
    isActive() {
      return activeClip !== null && activeRangeAtFrame(activeClip, frame()) !== null;
    },
    canCancel() {
      return activeClip !== null && phasesAtFrame(activeClip, frame()).includes("cancel");
    },
    activeWindowMs() {
      if (activeClip === null) return null;
      const range = activeRangeAtFrame(activeClip, frame());
      if (range === null) return null;
      const perFrameMs = 1000 / activeClip.fps;
      return { from: range.from * perFrameMs, to: range.to * perFrameMs };
    },
  };
}
