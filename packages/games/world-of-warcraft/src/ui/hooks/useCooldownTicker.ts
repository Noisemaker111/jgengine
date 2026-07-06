import { useEffect, useState } from "react";

/** Re-render hotbar ~12fps while mounted so cooldown overlays animate. */
export function useCooldownTicker(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((current) => current + 1), 80);
    return () => window.clearInterval(id);
  }, []);

  return tick;
}