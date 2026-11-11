/** Hold activation shared by pointer, touch, keyboard and pad, using an injected clock. */
export class RuneActivation {
  private active: { id: string; at: number; hold: number } | undefined;
  constructor(private readonly now: () => number) {}
  begin(id: string, hold = 0): void { this.active = { id, hold, at: this.now() }; }
  end(id: string, cancelled = false): boolean {
    const active = this.active;
    this.active = undefined;
    return !cancelled && active?.id === id && this.now() - active.at >= active.hold;
  }
  cancel(): void { this.active = undefined; }
}

/** Choose the closest control in the requested direction using native painted rectangles. */
export function runeNextFocus<T>(current: T, controls: readonly T[], rect: (item: T) => readonly [number,number,number,number] | undefined, direction: "up" | "down" | "left" | "right"): T | undefined {
  const source = rect(current);
  if (source === undefined) return undefined;
  const cx = source[0] + source[2] / 2, cy = source[1] + source[3] / 2;
  let best: T | undefined, distance = Infinity;
  for (const control of controls) {
    if (control === current) continue;
    const r = rect(control);
    if (r === undefined) continue;
    const dx = r[0] + r[2] / 2 - cx, dy = r[1] + r[3] / 2 - cy;
    const forward = direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
    if (forward <= 1) continue;
    const cross = direction === "left" || direction === "right" ? dy : dx;
    const score = forward + Math.abs(cross) * 3;
    if (score < distance) { best = control; distance = score; }
  }
  return best;
}
