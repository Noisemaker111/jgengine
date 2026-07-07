export type GamePanel = "backpack" | "character" | "abilities" | "emotes" | null;

type Listener = () => void;

let openPanel: GamePanel = null;
let selectedHotbarSlot = 0;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeUi(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOpenPanel(): GamePanel {
  return openPanel;
}

export function getSelectedHotbarSlot(): number {
  return selectedHotbarSlot;
}

export function togglePanel(panel: Exclude<GamePanel, null>): void {
  openPanel = openPanel === panel ? null : panel;
  notify();
}

export function closePanels(): void {
  if (openPanel === null) return;
  openPanel = null;
  notify();
}

export function scrollHotbar(delta: number, slotCount = 9): void {
  selectedHotbarSlot = (selectedHotbarSlot + delta + slotCount) % slotCount;
  notify();
}

export function setSelectedHotbarSlot(index: number, slotCount = 9): void {
  if (index < 0 || index >= slotCount) return;
  selectedHotbarSlot = index;
  notify();
}