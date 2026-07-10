import { RESPAWN_PENALTY_SECONDS } from "../physics/constants";
import { medalFor, streakBonusSeconds, type CourseDef, type Medal } from "../world/courses";

export type GamePhase = "menu" | "playing" | "finished" | "lost";

export interface Toast {
  id: string;
  text: string;
  at: number;
}

export interface SessionState {
  phase: GamePhase;
  courseId: string;
  selectedCourseId: string;
  startedAt: number;
  penaltySeconds: number;
  streak: number;
  bestStreak: number;
  trueSwingReleases: number;
  totalReleases: number;
  checkpointsHit: number;
  totalCheckpoints: number;
  longestFlightDistance: number;
  medal: Medal | null;
  finishSeconds: number | null;
  toasts: readonly Toast[];
}

const MAX_TOASTS = 3;

export function pushToast(toasts: readonly Toast[], text: string, at: number): readonly Toast[] {
  const next = [...toasts, { id: `toast-${at.toFixed(4)}-${toasts.length}`, text, at }];
  return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
}

export function initialSession(defaultCourseId: string): SessionState {
  return {
    phase: "menu",
    courseId: defaultCourseId,
    selectedCourseId: defaultCourseId,
    startedAt: 0,
    penaltySeconds: 0,
    streak: 0,
    bestStreak: 0,
    trueSwingReleases: 0,
    totalReleases: 0,
    checkpointsHit: 0,
    totalCheckpoints: 0,
    longestFlightDistance: 0,
    medal: null,
    finishSeconds: null,
    toasts: [],
  };
}

/** Starting (or restarting) a course always returns a fresh session object — no leftover streak, penalty, or toast survives a restart. */
export function startCourse(course: CourseDef, now: number): SessionState {
  return {
    ...initialSession(course.id),
    phase: "playing",
    courseId: course.id,
    selectedCourseId: course.id,
    startedAt: now,
    totalCheckpoints: course.checkpoints.length,
    toasts: pushToast([], "Hook's out! Swing true.", now),
  };
}

export function selectCourse(state: SessionState, courseId: string): SessionState {
  return state.phase === "menu" ? { ...state, selectedCourseId: courseId } : state;
}

export function applyRelease(state: SessionState, wasTrueSwing: boolean, now: number): SessionState {
  const streak = wasTrueSwing ? state.streak + 1 : 0;
  const toasts = wasTrueSwing
    ? pushToast(state.toasts, `Apex bell! True swing streak x${streak}`, now)
    : state.streak > 0
      ? pushToast(state.toasts, "Off the bell — streak reset.", now)
      : state.toasts;
  return {
    ...state,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    trueSwingReleases: state.trueSwingReleases + (wasTrueSwing ? 1 : 0),
    totalReleases: state.totalReleases + 1,
    toasts,
  };
}

export function applyFlightDistance(state: SessionState, distance: number): SessionState {
  return { ...state, longestFlightDistance: Math.max(state.longestFlightDistance, distance) };
}

export function applyMissedHook(state: SessionState, now: number): SessionState {
  return { ...state, toasts: pushToast(state.toasts, "Hook's out — no pylon in range.", now) };
}

export function applyRespawnPenalty(state: SessionState, now: number): SessionState {
  return {
    ...state,
    penaltySeconds: state.penaltySeconds + RESPAWN_PENALTY_SECONDS,
    streak: 0,
    toasts: pushToast(state.toasts, "Splash! Back to the last checkpoint, +5s.", now),
  };
}

export function applyCheckpoint(state: SessionState, checkpointIndex: number, now: number): SessionState {
  return {
    ...state,
    checkpointsHit: Math.max(state.checkpointsHit, checkpointIndex + 1),
    toasts: pushToast(state.toasts, `Checkpoint ${checkpointIndex + 1} of ${state.totalCheckpoints} — nice line!`, now),
  };
}

function medalToast(medal: Medal): string {
  if (medal === "gold") return "Gold run! Twelve seconds under par and counting.";
  if (medal === "silver") return "Silver medal — the marshal's impressed.";
  if (medal === "bronze") return "Bronze medal — the mail got through.";
  return "Route complete — no medal this time, but the mail's delivered.";
}

export function applyFinish(course: CourseDef, state: SessionState, rawElapsedSeconds: number, now: number): SessionState {
  const bonus = streakBonusSeconds(state.bestStreak);
  const effectiveSeconds = Math.max(0, rawElapsedSeconds + state.penaltySeconds - bonus);
  const medal = medalFor(course, effectiveSeconds);
  return {
    ...state,
    phase: "finished",
    finishSeconds: effectiveSeconds,
    medal,
    toasts: pushToast(state.toasts, medalToast(medal), now),
  };
}

export function applyTimeCap(state: SessionState, now: number): SessionState {
  if (state.phase !== "playing") return state;
  return { ...state, phase: "lost", toasts: pushToast(state.toasts, "Out of time — the mail's late!", now) };
}
