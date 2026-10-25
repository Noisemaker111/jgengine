import { createContext, useContext, type ReactNode } from "react";

import type { TabletNavState } from "@/tablet/tablet";

const TabletNavContext = createContext<TabletNavState | null>(null);

export function TabletNavProvider({ value, children }: { value: TabletNavState; children: ReactNode }) {
  return <TabletNavContext.Provider value={value}>{children}</TabletNavContext.Provider>;
}

export function useTabletNavContext(): TabletNavState {
  const value = useContext(TabletNavContext);
  if (value === null) {
    throw new Error("useTabletNavContext must be used within TabletNavProvider");
  }
  return value;
}
