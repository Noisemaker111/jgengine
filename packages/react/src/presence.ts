import { useEffect, useState } from "react";

/** Mount state for an element with an exit transition: `closed` keeps it mounted until the exit ends. */
export type PresenceState = "open" | "closed" | "unmounted";

/**
 * Keeps an element mounted for `exitMs` after `open` turns false, so a `data-state="closed"` exit
 * animation can play. Returns `"unmounted"` once the exit has finished (or at once when `exitMs` is 0).
 *
 * @capability presence keep a closing element mounted through its exit transition
 */
export function usePresence(open: boolean, exitMs: number): PresenceState {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (exitMs <= 0) {
      setMounted(false);
      return;
    }
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);
  if (open) return "open";
  return mounted ? "closed" : "unmounted";
}
