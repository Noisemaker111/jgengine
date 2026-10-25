import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";

type RackHardwareDragState = {
  rackId: string;
  slotIndex: number;
  hardwareModelId: HardwareModelId;
};

const RackHardwareDragVisualContext = createContext<{
  drag: RackHardwareDragState | null;
  setRackHardwareDrag: (next: RackHardwareDragState | null) => void;
} | null>(null);

export function RackHardwareDragVisualProvider({ children }: { children: ReactNode }) {
  const [drag, setRackHardwareDrag] = useState<RackHardwareDragState | null>(null);
  const value = useMemo(() => ({ drag, setRackHardwareDrag }), [drag]);
  return <RackHardwareDragVisualContext.Provider value={value}>{children}</RackHardwareDragVisualContext.Provider>;
}

export function useRackHardwareDragVisualOptional(): {
  drag: RackHardwareDragState | null;
  setRackHardwareDrag: (next: RackHardwareDragState | null) => void;
} | null {
  return useContext(RackHardwareDragVisualContext);
}
