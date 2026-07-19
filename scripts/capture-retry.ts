/**
 * Post-HMR staleness guard for shoot captures.
 *
 * The shoot daemon keeps one Vite + Chrome warm across many captures. Each
 * capture opens a fresh page and navigates, but a navigation that lands during
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
