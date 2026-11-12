/**
 * Event-scoped street-race barriers. A street race is a section of the open city fenced off for an
 * event: its seals (side streets closed) and chicane barriers stand only WHILE the race runs, so the
 * rest of the time the city drives as an open world. Game code starts and ends the event by key — the
 * id of the `city` volume hosting the race, or `<volume id>:<race id>` for one of several named races —
 * and renderers subscribe to stand the barriers up or take them down.
 *
 * Model code: plain state and listeners, no rendering. Process-wide, like the scene-kind registries.
 *
 * @capability street-race-events stand a street race's seals and chicane barriers up only while the race runs
 */

const active = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** Stand the barriers of the race keyed `key` up: the event has started. Idempotent. */
export function startStreetRaceEvent(key: string): void {
  if (active.has(key)) return;
  active.add(key);
  notify();
}

/** Take the race's barriers down again: the event is over and the streets reopen. Idempotent. */
export function endStreetRaceEvent(key: string): void {
  if (!active.delete(key)) return;
  notify();
}

/** Whether the race keyed `key` is running (its barriers stand). */
export function streetRaceEventActive(key: string): boolean {
  return active.has(key);
}

/** Every running race key, sorted. */
export function activeStreetRaceEvents(): string[] {
  return [...active].sort();
}

/** Call `listener` whenever a race event starts or ends; returns the unsubscribe. */
export function subscribeStreetRaceEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
