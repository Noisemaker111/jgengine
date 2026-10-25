export function formatTrainingDurationLabel(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return "Needs a training GPU";
  const s = Math.max(0, Math.floor(totalSeconds));

  if (s < 60) {
    return `${s}s`;
  }

  if (s === 60) {
    return "60s";
  }

  if (s < 3600) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return sec === 0 ? `${m}m` : `${m}m ${sec}s`;
  }

  const h = Math.floor(s / 3600);
  const rem = s % 3600;
  const m = Math.floor(rem / 60);
  const sec = rem % 60;

  if (m === 0 && sec === 0) {
    return `${h} Hr`;
  }
  if (sec === 0) {
    return `${h} Hr ${m}m`;
  }
  return `${h} Hr ${m}m ${sec}s`;
}
