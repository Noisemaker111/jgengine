export type FanStage = "up" | "on" | "down" | "off";

export interface FanSchedule {
  readonly id: string;
  readonly rampSec: number;
  readonly onSec: number;
  readonly offSec: number;
  readonly phaseOffset: number;
  readonly reverses: boolean;
}

export interface FanState {
  readonly power: number;
  readonly stage: FanStage;
  readonly direction: 1 | -1;
  readonly secondsToNextStage: number;
  readonly cycleSeconds: number;
}

export function fanCycleSeconds(schedule: FanSchedule): number {
  return schedule.rampSec * 2 + schedule.onSec + schedule.offSec;
}

function fanDirectionAt(schedule: FanSchedule, t: number, cycle: number): 1 | -1 {
  if (!schedule.reverses) return 1;
  const cycleIndex = Math.floor((t + schedule.phaseOffset) / cycle);
  return cycleIndex % 2 === 0 ? 1 : -1;
}

export function fanSpoolState(schedule: FanSchedule, t: number): FanState {
  const cycle = fanCycleSeconds(schedule);
  const rawPhase = (t + schedule.phaseOffset) % cycle;
  const phase = rawPhase < 0 ? rawPhase + cycle : rawPhase;
  const direction = fanDirectionAt(schedule, t, cycle);

  const upEnd = schedule.rampSec;
  const onEnd = upEnd + schedule.onSec;
  const downEnd = onEnd + schedule.rampSec;

  if (phase < upEnd) {
    return { power: schedule.rampSec <= 0 ? 1 : phase / schedule.rampSec, stage: "up", direction, secondsToNextStage: upEnd - phase, cycleSeconds: cycle };
  }
  if (phase < onEnd) {
    return { power: 1, stage: "on", direction, secondsToNextStage: onEnd - phase, cycleSeconds: cycle };
  }
  if (phase < downEnd) {
    const into = phase - onEnd;
    return { power: schedule.rampSec <= 0 ? 0 : 1 - into / schedule.rampSec, stage: "down", direction, secondsToNextStage: downEnd - phase, cycleSeconds: cycle };
  }
  return { power: 0, stage: "off", direction, secondsToNextStage: cycle - phase, cycleSeconds: cycle };
}
