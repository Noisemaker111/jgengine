export interface WorldLabel {
  id: string;
  text: string;
  color: string;
  border: string;
  mono?: boolean;
  position: [number, number, number];
}

const labels = new Map<string, WorldLabel>();
let list: readonly WorldLabel[] = [];
const listeners = new Set<() => void>();

function publish(): void {
  list = [...labels.values()];
  for (const listener of listeners) listener();
}

export const worldLabels = {
  read: (): readonly WorldLabel[] => list,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  set(label: WorldLabel): void {
    const current = labels.get(label.id);
    if (current !== undefined && current.text === label.text && current.color === label.color && current.border === label.border && current.mono === label.mono) return;
    labels.set(label.id, label);
    publish();
  },
  remove(id: string): void {
    if (labels.delete(id)) publish();
  },
  move(id: string, x: number, y: number, z: number): void {
    const label = labels.get(id);
    if (label === undefined) return;
    label.position[0] = x;
    label.position[1] = y;
    label.position[2] = z;
  },
};
