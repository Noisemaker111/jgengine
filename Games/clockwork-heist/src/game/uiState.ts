import { defineStore } from "@jgengine/core/store/defineStore";

export interface HeistUiState {
  scheduleOpen: boolean;
  scrubT: number | null;
}

export function initialUiState(): HeistUiState {
  return { scheduleOpen: false, scrubT: null };
}

export const uiStore = defineStore<HeistUiState>("ui", () => initialUiState());
