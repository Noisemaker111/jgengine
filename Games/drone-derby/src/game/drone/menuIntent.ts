import type { CourseId } from "../race/courses";

let courseRequest: CourseId | null = null;
let startRequested = false;
let restartRequested = false;
let chargeToggleRequested = false;

export function requestCourse(id: CourseId): void {
  courseRequest = id;
}

export function consumeCourseRequest(): CourseId | null {
  const value = courseRequest;
  courseRequest = null;
  return value;
}

export function requestStart(): void {
  startRequested = true;
}

export function consumeStartRequest(): boolean {
  const value = startRequested;
  startRequested = false;
  return value;
}

export function requestRestart(): void {
  restartRequested = true;
}

export function consumeRestartRequest(): boolean {
  const value = restartRequested;
  restartRequested = false;
  return value;
}

export function requestChargeToggle(): void {
  chargeToggleRequested = true;
}

export function consumeChargeToggleRequest(): boolean {
  const value = chargeToggleRequested;
  chargeToggleRequested = false;
  return value;
}
