/**
 * Post-HMR staleness guard for shoot captures.
 *
 * The shoot daemon keeps Chrome and each previously-used Vite target warm.
 * Each capture opens a fresh page and navigates, but a navigation that lands during
 * Vite's transient rebuild window right after an edit — HMR module invalidation,
 * dependency re-optimization answering `504 Outdated Optimize Dep`, or a queued
 * full-reload — can load an inconsistent module graph: the shell mounts but the
 * game never reaches live play, so the readiness wait fails with "a start menu
 * still on screen" (or times out). Before this guard a single failed navigation
 * exited non-zero, so the operator saw the capture "fail twice" until a daemon
 * stop/start restarted Vite and cleared the transient state.
 *
 * These pure helpers decide when a capture failure looks like that transient
 * post-HMR window (worth one fresh cache-bypassed reload) versus a deterministic
 * failure — unknown capture state, unregistered command, layout overflow — that a
 * reload can never fix, plus how long to let the dev server settle before the
 * retry. Keeping the decision pure lets it be unit-tested without a browser.
 */

/**
 * Substrings that mark a capture failure as a stale / mid-rebuild page rather
 * than a real config error. Matched case-insensitively against the thrown
 * message. Deliberately narrow: a genuine config error (unknown state, missing
 * command) never matches, so it surfaces immediately instead of paying a retry.
 */
export const STALE_FAILURE_MARKERS: readonly string[] = [
  // assertNoMenuOnScreen(): shell mounted but play never took over the menu.
  "start menu still on screen",
  // waitCaptureReady() deadline: the fresh frame never arrived (rebuild in flight).
  "timed out waiting for data-jg-capture",
  // The page's own 25 s wait for its first canvas: a dev server the broker had just restarted
  // (its tree moved) served a cold module graph to a PC at 80% CPU, and the reload finds it warm
  // (perf ab, harbor-heat, 2026-11-09).
  "timed out waiting for canvas",
];

/**
 * True when `message` looks like the transient post-HMR window — the only class
 * of failure a fresh reload can recover. Config errors return false so they are
 * reported on the first attempt.
 */
export function isStaleCaptureFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return STALE_FAILURE_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

export interface CaptureRetryDecision {
  /** 1-based attempt that just failed. */
  attempt: number;
  /** Total attempts allowed (>= 1). */
  maxAttempts: number;
  /** The failure message thrown by the readiness wait. */
  message: string;
}

/**
 * Whether to reload-and-retry after a failed capture attempt: only when budget
 * remains and the failure looks like the transient post-HMR window.
 */
export function shouldRetryCapture(decision: CaptureRetryDecision): boolean {
  if (!Number.isFinite(decision.attempt) || !Number.isFinite(decision.maxAttempts)) return false;
  if (decision.attempt < 1 || decision.attempt >= decision.maxAttempts) return false;
  return isStaleCaptureFailure(decision.message);
}

/**
 * Linear backoff giving Vite time to finish an in-flight rebuild before the
 * reload. `attempt` is the failed attempt number (1-based); each retry waits a
 * little longer so a slow dep re-optimization still lands on the settled build.
 */
export function retrySettleMs(attempt: number, baseMs = 1_500): number {
  const clampedAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const clampedBase = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : 1_500;
  return clampedBase * clampedAttempt;
}

/** CPU time across every core at one moment; two of them say how busy the PC was in between. */
export interface CpuSample {
  idle: number;
  total: number;
}

/** Share of the PC's CPU in use between two samples, 0 to 100. */
export function cpuBusyPercent(from: CpuSample, to: CpuSample): number {
  const total = to.total - from.total;
  if (!(total > 0)) return 0;
  return Math.round(Math.min(100, Math.max(0, (1 - (to.idle - from.idle) / total) * 100)));
}

/** A readiness wait on a PC this busy gets one more window before it fails. */
export const BUSY_PC_PERCENT = 80;

/** What the page showed when its readiness wait ran out. */
export interface ReadinessTimeout {
  waitedMs: number;
  /** `data-jg-capture` when the wait ended; null when the page never set it. */
  status: string | null;
  /** The page's address; a `chrome-error://` page means the document itself never loaded. */
  href: string | null;
  /** The URL the capture opened. */
  url: string;
  cpuBusy: number;
  /** What the page's gate was still waiting on (`data-jg-capture-stage`): the canvas, the run, or models still streaming. */
  stage?: string | null;
}

/**
 * The one line a readiness timeout fails with: what the page was doing and how busy the PC was, so
 * a slow PC, a page that never loaded and a page stuck mid-boot read differently. Keeps the
 * `timed out waiting for data-jg-capture` marker the stale-page retry matches.
 */
export function readinessTimeoutLine(timeout: ReadinessTimeout): string {
  const seconds = Math.round(timeout.waitedMs / 1000);
  const page = timeout.href?.startsWith("chrome-error://")
    ? `the page never loaded: nothing answered at ${originOf(timeout.url)}, so the dev server is gone`
    : timeout.status === null
      ? "the page never started the capture handshake (no data-jg-capture), so it is still loading its code or is not a jgengine page"
      : `the page was still "${timeout.status}"${timeout.stage == null ? "" : ` (${timeout.stage})`}`;
  const pc = timeout.cpuBusy >= BUSY_PC_PERCENT
    ? `; the PC's CPU was ${timeout.cpuBusy}% busy throughout, so rerun when it is quieter or pass a longer --timeout`
    : `; the PC's CPU was ${timeout.cpuBusy}% busy`;
  return `timed out waiting for data-jg-capture=ready after ${seconds}s: ${page}${pc}`;
}

function originOf(url: string): string {
  if (url.length === 0) return "the page's address";
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
