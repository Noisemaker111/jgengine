export interface SkillCheckZone {
  start: number;
  end: number;
}

export interface SkillCheckConfig {
  trackWidth: number;
  zone: SkillCheckZone;
  markerPeriod: number;
  window: number;
  zoneDriftPerSecond?: number;
}

export interface SkillCheckResult {
  success: boolean;
  timedOut: boolean;
  markerPosition: number;
  zone: SkillCheckZone;
}

function bounce(t: number, period: number, max: number): number {
  if (period <= 0 || max <= 0) return 0;
  const cycle = max * 2;
  const phase = ((t % period) / period) * cycle;
  return phase <= max ? phase : cycle - phase;
}

export function skillCheckMarkerPosition(config: SkillCheckConfig, elapsedSeconds: number): number {
  return bounce(Math.max(0, elapsedSeconds), config.markerPeriod, config.trackWidth);
}

export function skillCheckZoneAt(config: SkillCheckConfig, elapsedSeconds: number): SkillCheckZone {
  const drift = config.zoneDriftPerSecond ?? 0;
  if (drift === 0) return config.zone;
  const width = config.zone.end - config.zone.start;
  const travel = Math.max(0, config.trackWidth - width);
  const start = bounce(Math.max(0, elapsedSeconds) * Math.abs(drift), config.markerPeriod, travel);
  return { start, end: start + width };
}

export function evaluateSkillCheck(config: SkillCheckConfig, elapsedSeconds: number): SkillCheckResult {
  const timedOut = elapsedSeconds > config.window;
  const markerPosition = skillCheckMarkerPosition(config, elapsedSeconds);
  const zone = skillCheckZoneAt(config, elapsedSeconds);
  const inZone = markerPosition >= zone.start && markerPosition <= zone.end;
  return { success: !timedOut && inZone, timedOut, markerPosition, zone };
}
