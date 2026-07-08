export interface PaintStroke {
  u: number;
  v: number;
  radius: number;
  color: string;
}

export interface PaintLayer {
  paint(instanceId: string, stroke: PaintStroke): void;
  strokes(instanceId: string): readonly PaintStroke[];
  paintedIds(): readonly string[];
  clear(instanceId?: string): void;
  version(instanceId: string): number;
  subscribe(listener: () => void): () => void;
}

export function createPaintLayer(): PaintLayer {
  const strokesByInstance = new Map<string, PaintStroke[]>();
  const versionByInstance = new Map<string, number>();
  const listeners = new Set<() => void>();

  function bumpVersion(instanceId: string): void {
    versionByInstance.set(instanceId, (versionByInstance.get(instanceId) ?? 0) + 1);
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    paint(instanceId, stroke) {
      const list = strokesByInstance.get(instanceId);
      if (list === undefined) strokesByInstance.set(instanceId, [stroke]);
      else list.push(stroke);
      bumpVersion(instanceId);
      notify();
    },
    strokes(instanceId) {
      return strokesByInstance.get(instanceId) ?? [];
    },
    paintedIds() {
      return Array.from(strokesByInstance.keys());
    },
    clear(instanceId) {
      if (instanceId === undefined) {
        if (strokesByInstance.size === 0) return;
        for (const id of strokesByInstance.keys()) bumpVersion(id);
        strokesByInstance.clear();
        notify();
        return;
      }
      if (!strokesByInstance.delete(instanceId)) return;
      bumpVersion(instanceId);
      notify();
    },
    version(instanceId) {
      return versionByInstance.get(instanceId) ?? 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
