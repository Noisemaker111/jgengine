/**
 * One step of a plain-number countdown: `remaining` seconds less `dt`, never below 0. Keep the number in
 * serializable state and read `> 0` as "still waiting"; for a clocked or paced wait use the schedule.
 *
 * @capability cooldown tick a per-agent seconds countdown that gates an action
 */
export function tickCooldown(remaining: number, dt: number): number {
  return remaining > dt ? remaining - dt : 0;
}
