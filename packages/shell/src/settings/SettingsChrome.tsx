import { useSettings } from "@jgengine/react/settings";

import { QuickControls } from "./QuickControls";
import { SettingsButton } from "./SettingsButton";
import { SettingsMenu } from "./SettingsMenu";

export function SettingsChrome() {
  const settings = useSettings();
  if (settings.categories.length === 0) return null;
  return (
    <>
      {settings.surface === "menu" ? <SettingsButton onOpen={settings.open} /> : null}
      {settings.surface === "quick" ? <QuickControls controller={settings} /> : null}
      {settings.isOpen ? <SettingsMenu controller={settings} onClose={settings.close} /> : null}
    </>
  );
}
