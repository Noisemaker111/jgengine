/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { TABLET_STORE_TABS, type TabletStoreTabId } from "../tablet";
import type { TabletTutorialLock } from "../../tutorial/tutorialRuntime";
import { FULL } from "../../ui/kit";
import { Tabs } from "../../ui/shop";

const STORE_TAB_LABELS: Record<TabletStoreTabId, string> = {
  infrastructure: "Infrastructure",
  decor: "Decor",
  hardware: "Hardware",
  cooling: "Cooling",
  operator: "Operator",
};

/** The store's departments; the tutorial can lock all but one and point at it. */
export function TabletStoreTabs({ activeStoreTab, tutorialLock, isStoreTabAllowed, onOpenStoreTab }: {
  activeStoreTab: TabletStoreTabId;
  tutorialLock: TabletTutorialLock | null;
  isStoreTabAllowed: (storeTabId: TabletStoreTabId) => boolean;
  onOpenStoreTab: (storeTabId: TabletStoreTabId) => void;
}) {
  return <RuneView width={FULL} padding={[10, 12, 10, 12]} fill="#09090be6">
    <Tabs tabs={TABLET_STORE_TABS} active={activeStoreTab} labels={STORE_TAB_LABELS} allowed={isStoreTabAllowed}
      highlighted={(id) => tutorialLock !== null && tutorialLock.highlightedStoreTab === id} onSelect={onOpenStoreTab} accent="#10b981" />
  </RuneView>;
}
