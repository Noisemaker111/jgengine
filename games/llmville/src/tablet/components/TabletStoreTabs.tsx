import { TutorialArrow } from "@/tutorial/components/TutorialUi";
import { TABLET_STORE_TABS, type TabletStoreTabId } from "@/tablet/tablet";
import {
  TABLET_SEGMENTED_TAB_TRAY_CLASS,
  TABLET_STORE_TAB_LABEL_ACTIVE_CLASS,
  TABLET_STORE_TAB_LABEL_CLASS,
  TABLET_STORE_TABS_SHELL_CLASS,
  tabletTabButtonClass,
} from "@/tablet/tabletTabBar";
import type { TabletTutorialLock } from "@/tutorial/tutorialRuntime";

const STORE_TAB_LABELS: Record<TabletStoreTabId, string> = {
  infrastructure: "Infrastructure",
  decor: "Decor",
  hardware: "Hardware",
  cooling: "Cooling",
  operator: "Operator",
};

interface TabletStoreTabsProps {
  activeStoreTab: TabletStoreTabId;
  tutorialLock: TabletTutorialLock | null;
  isStoreTabAllowed: (storeTabId: TabletStoreTabId) => boolean;
  onOpenStoreTab: (storeTabId: TabletStoreTabId) => void;
}

export function TabletStoreTabs({
  activeStoreTab,
  tutorialLock,
  isStoreTabAllowed,
  onOpenStoreTab,
}: TabletStoreTabsProps) {
  return (
    <div className={TABLET_STORE_TABS_SHELL_CLASS}>
      <div className={TABLET_SEGMENTED_TAB_TRAY_CLASS}>
        {TABLET_STORE_TABS.map((id) => {
          const allowed = isStoreTabAllowed(id);
          const highlighted = tutorialLock !== null && tutorialLock.highlightedStoreTab === id;
          const active = activeStoreTab === id;

          return (
            <button
              key={id}
              onClick={() => onOpenStoreTab(id)}
              disabled={!allowed}
              className={tabletTabButtonClass(active, allowed, highlighted)}
            >
              {highlighted && !active ? <TutorialArrow className="!-top-6 scale-75" /> : null}
              <span
                className={`${TABLET_STORE_TAB_LABEL_CLASS} ${active ? TABLET_STORE_TAB_LABEL_ACTIVE_CLASS : ""}`}
              >
                {STORE_TAB_LABELS[id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
