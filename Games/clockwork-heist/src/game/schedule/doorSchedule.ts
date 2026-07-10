import { telegraphProgress } from "@jgengine/core/combat/telegraph";

export interface DoorEvent {
  at: number;
  locked: boolean;
}

export interface DoorDef {
  id: string;
  name: string;
  roomAName: string;
  roomBName: string;
  gapCenter: readonly [number, number];
  axis: "x" | "z";
  initiallyLocked: boolean;
  events: readonly DoorEvent[];
}

export interface DoorState {
  locked: boolean;
  changesAt: number | null;
  progress: number;
}

/**
 * Pure lock-state-at-time for a door's authored one-shot schedule. Reuses
 * `telegraphProgress` for the "how far into this segment" countdown-ring math
 * instead of hand-rolling a second progress formula.
 */
export function doorStateAt(door: DoorDef, t: number): DoorState {
  let locked = door.initiallyLocked;
  let segmentStart = 0;
  let nextEvent: DoorEvent | null = null;
  for (const event of door.events) {
    if (event.at <= t) {
      locked = event.locked;
      segmentStart = event.at;
    } else if (nextEvent === null) {
      nextEvent = event;
    }
  }
  if (nextEvent === null) {
    return { locked, changesAt: null, progress: 1 };
  }
  const progress = telegraphProgress(nextEvent.at - segmentStart, segmentStart, t);
  return { locked, changesAt: nextEvent.at, progress };
}
