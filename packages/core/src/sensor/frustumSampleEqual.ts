import type { FrustumSample } from "@jgengine/core/sensor/frustumSensor";

/** True when two frustum samples would draw the same, so a HUD can skip a re-render. */
export function frustumSampleDisplayEqual(a: FrustumSample | null, b: FrustumSample | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.id === b.id &&
    a.inView === b.inView &&
    Math.round(a.framing * 100) === Math.round(b.framing * 100) &&
    Math.round(a.dwellSeconds * 10) === Math.round(b.dwellSeconds * 10)
  );
}
