import { useState } from "react";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { KitButton, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { SettingsSection, SettingsTabs } from "@jgengine/core/settings/settingsBlocks.view";

/**
 * The keep's settings, cut into a stone tablet: category tabs are chiselled notches, every row is a
 * channel cut into the slab, and the engine's own rows and drawn sliders sit inside the channels.
 * Every row still writes straight to the shell's settings store.
 */
export function StoneSettings({ onCaptureChange }: { onCaptureChange: (armed: boolean) => void }) {
  const settings = useSettings();
  const categories = settings.categories;
  const [chosen, setChosen] = useState<string | null>(null);
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId);

  return (
    <KitPanel material="stone" tint="#57524a" cut="chamfer" depth={18} padding="20px 22px 18px" className="bb-tablet" data-menu-settings="">
      <h2 className="bb-carved">Prepare the Keep</h2>
      <SettingsTabs className="bb-tabs" categories={categories} activeId={activeId} onSelect={setChosen} />
      <div className="bb-tablet-body">
        {settings.actions.length > 0 && (
          <div className="bb-tablet-actions">
            {settings.actions.map((action) => (
              <KitButton
                key={action.id}
                material={action.kind === "danger" ? "enamel" : "wood"}
                tint={action.kind === "danger" ? "#7d2416" : undefined}
                cut="notch"
                depth={8}
                padding="7px 16px"
                className="bb-small-plank"
                onClick={action.run}
              >
                {action.label}
              </KitButton>
            ))}
          </div>
        )}
        {active !== undefined && <SettingsSection category={active} heading={false} onCaptureChange={(action) => onCaptureChange(action !== null)} />}
      </div>
    </KitPanel>
  );
}
