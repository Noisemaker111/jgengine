import { useState } from "react";

import { SettingsTabPanels } from "@/settings/components/SettingsTabPanels";
import type { SettingsTabId } from "@/settings/settings";

interface SettingsAppProps {
  onExitToMenu?: () => void;
}

/** In-tablet settings surface (no floating modal). */
export function SettingsApp({ onExitToMenu }: SettingsAppProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");

  return (
    <SettingsTabPanels
      embedded
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerActionLabel={onExitToMenu !== undefined ? "Main Menu" : undefined}
      onHeaderAction={onExitToMenu}
    />
  );
}
