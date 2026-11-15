import { BERTHS, BERTH_SIZE } from "./layout";

/**
 * Two small live feeds between the house and its front desk, neither of them saved: which room the
 * player last clicked in the world (the Rooms plan opens on it), and what the tenants have just
 * said out loud (drawn as speech bubbles over their heads).
 */

type Listener = () => void;
function feed<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    read: () => value,
    write(next: T) { value = next; for (const listener of listeners) listener(); },
    subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/** The room the player clicked, with a counter so clicking the same room again re-opens it. */
export const roomFocus = feed<{ slot: number; seq: number }>({ slot: 0, seq: 0 });

export function focusRoom(slot: number): void {
  roomFocus.write({ slot, seq: roomFocus.read().seq + 1 });
}

/** The berth under a world point, or null when the point is not inside a module's footprint. */
export function berthAt(x: number, z: number): number | null {
  for (const berth of BERTHS) {
    if (Math.abs(x - berth.x) <= BERTH_SIZE.w / 2 && Math.abs(z - berth.z) <= BERTH_SIZE.d / 2) return berth.slot;
  }
  return null;
}

export interface Bubble { id: number; tenantId: string; text: string; born: number; tone: "happy" | "grumpy" }

/** How long a bubble stays over a tenant, in wall-clock milliseconds. */
export const BUBBLE_MS = 6500;
let bubbleSeq = 0;
export const bubbles = feed<readonly Bubble[]>([]);

export function sayAloud(tenantId: string, text: string, tone: Bubble["tone"], now = Date.now()): void {
  bubbleSeq += 1;
  const live = bubbles.read().filter((bubble) => now - bubble.born < BUBBLE_MS && bubble.tenantId !== tenantId);
  bubbles.write([...live.slice(-2), { id: bubbleSeq, tenantId, text, born: now, tone }]);
}
