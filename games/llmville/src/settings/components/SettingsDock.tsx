import { useNavigate, useSearch } from "@tanstack/react-router";
import { Cog } from "lucide-react";

import { SettingsModal } from "@/settings/components/SettingsModal";
import { isSettingsTabId, type SettingsTabId } from "@/settings/settings";

interface ControlledSettingsDockProps {
  open: boolean;
  activeTab: SettingsTabId;
  onOpenChange: (nextOpen: boolean) => void;
  onTabChange: (tab: SettingsTabId) => void;
  headerActionLabel?: string;
  onHeaderAction?: () => void;
  /** Floating cog trigger — off when settings live in a main-menu list. */
  showTrigger?: boolean;
}

export function ControlledSettingsDock({
  open,
  activeTab,
  onOpenChange,
  onTabChange,
  headerActionLabel,
  onHeaderAction,
  showTrigger = true,
}: ControlledSettingsDockProps) {
  return (
    <>
      <SettingsModal
        open={open}
        onClose={() => onOpenChange(false)}
        activeTab={activeTab}
        onTabChange={onTabChange}
        headerActionLabel={headerActionLabel}
        onHeaderAction={onHeaderAction}
      />

      {showTrigger ? (
        <div className="pointer-events-none fixed bottom-5 right-5 z-40">
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Close settings" : "Open settings"}
            onClick={() => onOpenChange(!open)}
            className={`game-button game-button-secondary pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center p-0 ${open ? "border-brand-teal/50 text-brand-cream" : "text-brand-teal"}`}
          >
            <Cog className={`h-5 w-5 transition-transform duration-300 ${open ? "rotate-90" : ""}`} />
          </button>
        </div>
      ) : null}
    </>
  );
}

export function SettingsDock({ showTrigger = true }: { showTrigger?: boolean }) {
  const navigate = useNavigate();
  const search = useSearch({ from: "/" });

  const open = search.settings === true;
  const activeTab = isSettingsTabId(search.tab) ? search.tab : "general";

  const handleOpenChange = (nextOpen: boolean) => {
    void navigate({
      to: "/",
      search: nextOpen ? { settings: true, tab: activeTab } : { settings: undefined, tab: undefined },
      replace: !nextOpen,
    });
  };

  const handleTabChange = (tab: SettingsTabId) => {
    void navigate({ to: "/", search: { settings: true, tab }, replace: true });
  };

  return (
    <ControlledSettingsDock
      open={open}
      activeTab={activeTab}
      onOpenChange={handleOpenChange}
      onTabChange={handleTabChange}
      showTrigger={showTrigger}
    />
  );
}
