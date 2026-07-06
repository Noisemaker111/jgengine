export interface BoltVisual {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  duration: number;
  elapsed: number;
}

interface PendingShot {
  shotId: string;
  remaining: number;
  visual: BoltVisual;
}

const pendingShots: PendingShot[] = [];
const activeVisuals: BoltVisual[] = [];
const visualListeners = new Set<() => void>();
let visualVersion = 0;

function bumpVisuals(): void {
  visualVersion += 1;
  for (const listener of visualListeners) listener();
}

export function subscribeBoltVisuals(listener: () => void): () => void {
  visualListeners.add(listener);
  return () => visualListeners.delete(listener);
}

export function getBoltVisualVersion(): number {
  return visualVersion;
}

export function listBoltVisuals(): readonly BoltVisual[] {
  return activeVisuals;
}

export function queueProjectileShot(
  shotId: string,
  visual: Omit<BoltVisual, "elapsed">,
  settleDelaySeconds: number,
): void {
  pendingShots.push({
    shotId,
    remaining: settleDelaySeconds,
    visual: { ...visual, elapsed: 0 },
  });
  activeVisuals.push({ ...visual, elapsed: 0 });
  bumpVisuals();
}

export function tickPendingProjectiles(
  dt: number,
  settle: (shotId: string) => void,
): void {
  for (let index = pendingShots.length - 1; index >= 0; index -= 1) {
    const shot = pendingShots[index]!;
    shot.remaining -= dt;
    shot.visual.elapsed += dt;
    if (shot.remaining > 0) continue;
    settle(shot.shotId);
    pendingShots.splice(index, 1);
  }

  for (let index = activeVisuals.length - 1; index >= 0; index -= 1) {
    const visual = activeVisuals[index]!;
    visual.elapsed += dt;
    if (visual.elapsed >= visual.duration) activeVisuals.splice(index, 1);
  }
  if (pendingShots.length > 0 || activeVisuals.length > 0) bumpVisuals();
}