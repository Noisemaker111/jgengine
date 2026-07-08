export interface FreezeSubject {
  id: string;
  groundSpeed: number;
}

export interface FreezeViolation {
  id: string;
  speed: number;
  movedSeconds: number;
}

export interface FreezeMonitor {
  tick(subjects: readonly FreezeSubject[], frozenIds: ReadonlySet<string>, dt: number): FreezeViolation[];
  reset(id?: string): void;
}

export function createFreezeMonitor(config?: { toleranceSpeed?: number; graceSeconds?: number }): FreezeMonitor {
  const toleranceSpeed = config?.toleranceSpeed ?? 0.05;
  const graceSeconds = config?.graceSeconds ?? 0;
  const moved = new Map<string, number>();

  return {
    tick(subjects, frozenIds, dt) {
      const seen = new Set<string>();
      const violations: FreezeViolation[] = [];
      for (const subject of subjects) {
        seen.add(subject.id);
        const shouldHoldStill = frozenIds.has(subject.id) && subject.groundSpeed > toleranceSpeed;
        if (!shouldHoldStill) {
          moved.delete(subject.id);
          continue;
        }
        const movedSeconds = (moved.get(subject.id) ?? 0) + dt;
        moved.set(subject.id, movedSeconds);
        if (movedSeconds > graceSeconds) {
          violations.push({ id: subject.id, speed: subject.groundSpeed, movedSeconds });
        }
      }
      for (const id of moved.keys()) {
        if (!seen.has(id)) moved.delete(id);
      }
      return violations;
    },
    reset(id) {
      if (id === undefined) moved.clear();
      else moved.delete(id);
    },
  };
}
