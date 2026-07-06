import { useSyncExternalStore } from "react";
import { getOpenPanel, getSelectedHotbarSlot, subscribeUi } from "../uiController";

export function useOpenPanel() {
  return useSyncExternalStore(subscribeUi, getOpenPanel, getOpenPanel);
}

export function useSelectedHotbarSlot() {
  return useSyncExternalStore(subscribeUi, getSelectedHotbarSlot, getSelectedHotbarSlot);
}