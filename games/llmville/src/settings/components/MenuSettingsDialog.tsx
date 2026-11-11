/** @jsxImportSource @jgengine/core/ui/jsx */
import { SettingsProvider, useSettings } from "@jgengine/core/settings/settings.view";
import { SettingsRuntime } from "@jgengine/core/settings/SettingsRuntime.draw";

import { navigate, useScreenLocation } from "../../screens/screenRouter";
import { Sheet } from "../../ui/kit";
import { appEngineSettings, parseHomeRouteSearch } from "../settings";
import { SettingsPanel } from "./SettingsPanel";

const noop = () => undefined;
/** Without a running game the menu has no controls to rebind through the shell; keybinds are the game's own tab. */
const MENU_SETTINGS_HIDDEN = ["controls"] as const;

function MenuSettingsBody({ tab, onTabChange }: { tab: string | undefined; onTabChange: (tab: string) => void }) {
  const { categories } = useSettings();
  return <SettingsPanel categories={categories} initialTab={tab} onTabChange={onTabChange} />;
}

/** The settings sheet a page shows, over the same settings store the game reads. */
export function SettingsSheet({ tab, close, onTabChange }: { tab: string | undefined; close: () => void; onTabChange: (tab: string) => void }) {
  return <SettingsProvider store={appEngineSettings()}>
    <SettingsRuntime input={{}} buses={undefined} extra={[]} categories={[]} hide={MENU_SETTINGS_HIDDEN} fovEnabled={false} hideBindings={[]}
      touchStyle={false} overrides={{}} rebind={noop} resetBinding={noop} variant="panel" surface={false} actions={[]}>
      <Sheet title="Settings" close={close}>
        <MenuSettingsBody tab={tab} onTabChange={onTabChange} />
      </Sheet>
    </SettingsRuntime>
  </SettingsProvider>;
}

/** The main menu's settings sheet, opened by the `settings` search flag. */
export function MenuSettingsDialog() {
  const search = parseHomeRouteSearch(useScreenLocation().search);
  if (search.settings !== true) return null;
  return <SettingsSheet tab={search.tab}
    close={() => void navigate({ to: "/", search: { settings: undefined, tab: undefined }, replace: true })}
    onTabChange={(tab) => void navigate({ to: "/", search: { settings: true, tab }, replace: true })} />;
}
