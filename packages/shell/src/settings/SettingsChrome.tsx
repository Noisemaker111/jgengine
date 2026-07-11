import { useSettings } from "@jgengine/react/settings";

import { QuickControls } from "./QuickControls";
import { SettingsMenu } from "./SettingsMenu";

export function SettingsChrome() {
  const settings = useSettings();
  if (settings.categories.length === 0 && settings.actions.length === 0) return null;
  return (
    <>
      {settings.surface === "quick" ? <QuickControls controller={settings} /> : null}
      {settings.isOpen ? <SettingsMenu controller={settings} onClose={settings.close} /> : null}
    </>
  );
}
