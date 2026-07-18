/** Formats a past timestamp as a short relative phrase ("just now", "2m ago", "3h ago"). @internal */
export function formatSavedRelative(savedAtMs: number, nowMs: number = Date.now()): string {
  const elapsedSec = Math.max(0, Math.floor((nowMs - savedAtMs) / 1000));
  if (elapsedSec < 45) return "just now";
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin < 60) return `${elapsedMin}m ago`;
  const elapsedHr = Math.floor(elapsedMin / 60);
  if (elapsedHr < 48) return `${elapsedHr}h ago`;
  const elapsedDay = Math.floor(elapsedHr / 24);
  return `${elapsedDay}d ago`;
}
