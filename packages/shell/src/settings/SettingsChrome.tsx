import { useState } from "react";

import { HudOverlay } from "@jgengine/react/hud/hudThemeRoot";
import { useSettings } from "@jgengine/react/settings/settings";

import { QuickControls } from "./QuickControls";
import { SettingsMenu } from "./SettingsMenu";

export function SettingsChrome() {
  const settings = useSettings();
  // An anchor beside the GameUI chrome: the dialog renders into the overlay host there, inside the
  // game's HUD theme and kit, so it wears the game's look instead of the engine default.
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  if (settings.categories.length === 0 && settings.actions.length === 0) return null;
  return (
    <>
      <span ref={setAnchor} hidden data-jg-settings-anchor="" />
      {settings.surface === "quick" ? <QuickControls controller={settings} /> : null}
      {settings.isOpen ? (
        <HudOverlay anchor={anchor}>
          <SettingsMenu controller={settings} onClose={settings.close} />
        </HudOverlay>
      ) : null}
    </>
  );
}
