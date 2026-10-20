/**
 * Pure pieces of the capture readiness gate, split from captureReady.ts (which reads the URL at
 * module load) so they run under `bun test` without a browser.
 */

/** What the readiness gate observes between rendered frames. */
export interface ViewActivity {
  /** Times the shared model loader went busy since boot; a change means new streaming started. */
  modelLoadStarts: number;
  /** The shell's "Loading game view…" Suspense fallback is mounted. */
  viewLoading: boolean;
}

export interface QuiescenceDeps {
  activity: () => ViewActivity;
  /** Resolve after the page has rendered `count` more frames (each frame also steps the sim). */
  frames: (count: number) => Promise<void>;
  /** Resolve once the model loader has been idle long enough, bounded by its own timeout. */
  modelIdle: () => Promise<void>;
  now: () => number;
}

/**
 * Wait until the game view is quiescent: the code-split view is mounted, and a full round of
 * rendered frames followed by model idle started no new model streaming. One round is not enough
 * for staged content: the frame after a capture command is when the sim resolves its queued work
 * (construction, spawns), the render after that is when React mounts the spawned entities, and
 * mounting is what starts their model loads — so the loader can look idle before the staged
 * models were ever requested. Returns a reason string when the deadline passes first.
 */
export async function waitForQuiescentView(deps: QuiescenceDeps, timeoutMs: number, framesPerRound = 2): Promise<string | null> {
  const deadline = deps.now() + timeoutMs;
  let rounds = 0;
  let last = deps.activity();
  while (deps.now() < deadline) {
    await deps.frames(framesPerRound);
    await deps.modelIdle();
    const next = deps.activity();
    rounds += 1;
    const stable = !next.viewLoading && next.modelLoadStarts === last.modelLoadStarts;
    last = next;
    if (stable && rounds >= 2) return null;
  }
  return last.viewLoading
    ? `game view still loading ("Loading game view…" on screen) after ${Math.round(timeoutMs / 1000)}s — the 3D presentation never mounted`
    : `models kept streaming for ${Math.round(timeoutMs / 1000)}s — capturing would race them`;
}

/** The slice of an element the start-action picker reads. */
export interface StartCandidate {
  text: string;
  disabled: boolean;
  visible: boolean;
  /** `data-jg-start` is present: the game marked its primary start action. */
  marked: boolean;
  /** Looks like a primary button (class or data-variant names primary/cta). */
  primary: boolean;
  /** A settings/credits trigger the StartScreen scaffold marks itself. */
  utility: boolean;
}

const START_WORDS: readonly RegExp[] = [
  /\bstart\b/, /\bplay\b/, /\bbegin\b/, /\bnew (?:game|run)\b/, /\bnew\b/, /\blaunch\b/, /\benter\b/, /\bdeploy\b/,
  /\bcontinue\b/, /\bresume\b/,
];
const NOT_START = /settings|options|credits|quit|exit|guide|help|controls|back\b|about|leaderboard|language|load\b|delete|reset|keep\b/;

/**
 * Pick the button a player would press to leave a start menu, or `null` when nothing is clearly
 * one: a `data-jg-start` mark wins, then an enabled primary-styled button, then start-like
 * wording in priority order. Never picks settings, credits, quit or similar.
 */
export function pickStartAction<T extends StartCandidate>(candidates: readonly T[]): T | null {
  const usable = candidates.filter((c) => c.visible && !c.disabled && !c.utility && c.text.trim() !== "");
  const marked = usable.find((c) => c.marked);
  if (marked !== undefined) return marked;
  const plain = usable.filter((c) => !NOT_START.test(c.text.toLowerCase()));
  const primary = plain.find((c) => c.primary);
  if (primary !== undefined) return primary;
  for (const word of START_WORDS) {
    const hit = plain.find((c) => word.test(c.text.toLowerCase()));
    if (hit !== undefined) return hit;
  }
  return null;
}
