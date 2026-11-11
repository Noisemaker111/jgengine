/**
 * Labels that ride on scene objects (player nameplates, the editor's footprint gizmo). The scene side
 * registers each label and keeps its world `position` current from its object every frame; the HUD
 * draws the list on the native surface with `RuneFor` + `RuneWorldAnchor`, which re-projects the same
 * position tuple each frame. The list itself only changes when a label appears, changes or leaves.
 */
export interface WorldLabel {
  id: string;
  text: string;
  /** Text colour. */
  color: string;
  /** Plate border colour. */
  border: string;
  mono?: boolean;
  /** World position, updated in place by the owning scene object. */
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
  /** Add or replace a label; an unchanged label publishes nothing. */
  set(label: WorldLabel): void {
    const current = labels.get(label.id);
    if (current !== undefined && current.text === label.text && current.color === label.color && current.border === label.border && current.mono === label.mono) return;
    labels.set(label.id, label);
    publish();
  },
  remove(id: string): void {
    if (labels.delete(id)) publish();
  },
  /** Move a label without publishing (the anchor re-projects it every frame). */
  move(id: string, x: number, y: number, z: number): void {
    const label = labels.get(id);
    if (label === undefined) return;
    label.position[0] = x;
    label.position[1] = y;
    label.position[2] = z;
  },
};
