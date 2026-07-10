export const RUNNER_ENTITY = "runner";
export const GHOST_ENTITY = "ghost";
export const GHOST_ENTITY_FADED = "ghostFaded";

export function ghostEntityId(lapIndex: number): string {
  return `ghost-${lapIndex}`;
}

export function lapIndexFromGhostId(id: string): number {
  const parsed = Number.parseInt(id.slice("ghost-".length), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
