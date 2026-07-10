export interface HeistUiState {
  scheduleOpen: boolean;
  scrubT: number | null;
}

export function initialUiState(): HeistUiState {
  return { scheduleOpen: false, scrubT: null };
}
