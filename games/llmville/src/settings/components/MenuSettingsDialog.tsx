import { useNavigate, useSearch } from "@tanstack/react-router";
import { X } from "lucide-react";
import { createPortal } from "@jgengine/core/ui/jsx/client.view";

import { useDialogBehavior } from "@jgengine/core/dialog/dialogBehavior.view";
import { HudThemeRoot } from "@jgengine/core/hud/hudThemeRoot.view";
import { SettingsProvider, useSettings } from "@jgengine/core/settings/settings.view";
import { SettingsRuntime } from "@jgengine/core/settings/SettingsRuntime.draw";
import { KitButton, KitPanel, UiKitScope } from "@jgengine/core/ui/kit/uiKitRoot.view";

import { LlmvilleSettings, ReducedMotionSync } from "./LlmvilleSettings";
import { llmvilleHudTheme } from "../../kit/llmvilleKit";
import { appEngineSettings } from "../settings";

const noop = () => undefined;

/** Without a running game the menu has no controls to rebind through the shell; keybinds are the game's own tab. */
const MENU_SETTINGS_HIDDEN = ["controls"] as const;

function MenuSettingsBody({ tab, onTabChange }: { tab: string | undefined; onTabChange: (tab: string) => void }) {
  const { categories } = useSettings();
  return <LlmvilleSettings categories={categories} initialTab={tab} onTabChange={onTabChange} />;
}

/** The main menu's settings dialog, opened by the `settings` search flag, over the same settings the game reads. */
export function MenuSettingsDialog() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/" });
  const open = search.settings === true;
  const close = () => void navigate({ to: "/", search: { settings: undefined, tab: undefined }, replace: true });
  const dialogRef = useDialogBehavior({ open, onClose: close });
  if (!open) return null;

  return createPortal(
    <UiKitScope>
      <HudThemeRoot theme={llmvilleHudTheme}>
        <SettingsProvider store={appEngineSettings()}>
          <SettingsRuntime
            input={{}}
            buses={undefined}
            extra={[]}
            categories={[]}
            hide={MENU_SETTINGS_HIDDEN}
            fovEnabled={false}
            hideBindings={[]}
            touchStyle={false}
            overrides={{}}
            rebind={noop}
            resetBinding={noop}
            variant="panel"
            surface={false}
            actions={[]}
          >
            <ReducedMotionSync />
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" onClick={close} />
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-modal-title"
                tabIndex={-1}
                className="relative z-10 flex w-full max-w-2xl"
                style={{ height: "min(720px, calc(100vh - 2rem))" }}
              >
                <KitPanel as="div" variant="dialog" data-shell="terminal" className="flex w-full flex-col overflow-hidden">
                  <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 px-5 py-4">
                    <h2 id="settings-modal-title" className="font-game text-lg font-extrabold text-brand-cream">Settings</h2>
                    <KitButton variant="ghost" size="sm" onClick={close} aria-label="Close settings" icon={<X className="h-3.5 w-3.5" />} />
                  </div>
                  <MenuSettingsBody
                    tab={search.tab}
                    onTabChange={(tab) => void navigate({ to: "/", search: { settings: true, tab }, replace: true })}
                  />
                </KitPanel>
              </div>
            </div>
          </SettingsRuntime>
        </SettingsProvider>
      </HudThemeRoot>
    </UiKitScope>,
    document.body,
  );
}
