import { useEffect, useMemo, useState } from "@jgengine/core/ui/jsx";

import { useAccessibilitySettings } from "@jgengine/core/settings/accessibilitySettings.view";
import { KeybindingMenu } from "@jgengine/core/settings/keybindingMenu.view";
import type { SettingsCategoryView } from "@jgengine/core/settings/settings.view";
import { SettingsSection, SettingsTabs } from "@jgengine/core/settings/settingsBlocks.view";
import { KitButton, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";

import { keybindRebindSession, keybindsFromSession } from "@/settings/keybinds";
import { updateAppSettings, useAppSettings } from "@/settings/settings";

/** LLMville's own tabs after the shell's categories. */
const KEYBINDS_TAB = "keybinds";
const CREDITS_TAB = "credits";

const CREDITS: readonly { role: string; name: string }[] = [
  { role: "Game Design & Development", name: "The LLMville Team" },
  { role: "3D Engine & Rendering", name: "Three.js" },
  { role: "Backend & Sync", name: "Convex" },
  { role: "UI Framework", name: "React + Vite" },
  { role: "Routing", name: "TanStack Router" },
  { role: "Styling", name: "Tailwind CSS" },
];

/** Every LLMville action, rebindable; keys the game cannot bind fall back to the action's default. */
function KeybindsPanel() {
  const { keybinds } = useAppSettings();
  const session = useMemo(() => keybindRebindSession(keybinds), [keybinds]);
  return (
    <KeybindingMenu
      session={session}
      title="Keybinds"
      onChange={(changed) => updateAppSettings({ keybinds: keybindsFromSession(changed) })}
      style={{ width: "100%", boxShadow: "none" }}
    />
  );
}

function CreditsPanel() {
  return (
    <div className="space-y-4">
      <KitPanel data-shell="inset" className="divide-y divide-[var(--kit-line)] p-0">
        {CREDITS.map(({ role, name }) => (
          <div key={role} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-xs uppercase tracking-[0.14em] text-brand-cream/45">{role}</span>
            <span className="font-game text-sm text-brand-cream/80">{name}</span>
          </div>
        ))}
      </KitPanel>
      <p className="text-center text-xs text-brand-cream/40">Build something great.</p>
    </div>
  );
}

/** Mirrors the reduced-motion setting onto `:root`, where LLMville's own CSS animations read it. */
export function ReducedMotionSync() {
  const { reducedMotion } = useAccessibilitySettings();
  useEffect(() => {
    document.documentElement.dataset["reducedMotion"] = reducedMotion ? "true" : "false";
  }, [reducedMotion]);
  return null;
}

interface LlmvilleSettingsProps {
  /** The settings categories to show (the shell's, or a menu's own settings runtime). */
  categories: readonly SettingsCategoryView[];
  /** Tab open on mount. Default the first category. */
  initialTab?: string | undefined;
  onTabChange?: ((tab: string) => void) | undefined;
  headerActionLabel?: string | undefined;
  onHeaderAction?: (() => void) | undefined;
}

/**
 * LLMville's settings: the shell's categories (sound, graphics, gameplay, accessibility) as engine
 * settings blocks, then the game's keybinds and credits, under one tab rail.
 */
export function LlmvilleSettings({ categories, initialTab, onTabChange, headerActionLabel, onHeaderAction }: LlmvilleSettingsProps) {
  const tabs = useMemo(
    () => [...categories, { id: KEYBINDS_TAB, label: "Keybinds", rows: [], keybinds: [] }, { id: CREDITS_TAB, label: "Credits", rows: [], keybinds: [] }],
    [categories],
  );
  const [active, setActive] = useState(() => tabs.find((tab) => tab.id === initialTab)?.id ?? tabs[0]?.id ?? KEYBINDS_TAB);
  const category = categories.find((candidate) => candidate.id === active);
  const select = (id: string) => {
    setActive(id);
    onTabChange?.(id);
  };

  return (
    <div className="llm-settings flex h-full min-h-0 flex-col">
      <SettingsTabs categories={tabs} activeId={active} onSelect={select} className="shrink-0 border-b border-[var(--kit-line)] px-2" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {headerActionLabel !== undefined && onHeaderAction !== undefined ? (
          <div className="mb-3 flex justify-end">
            <KitButton variant="ghost" size="sm" onClick={onHeaderAction}>
              {headerActionLabel}
            </KitButton>
          </div>
        ) : null}
        {category !== undefined ? <SettingsSection key={category.id} category={category} heading={false} /> : null}
        {active === KEYBINDS_TAB ? <KeybindsPanel /> : null}
        {active === CREDITS_TAB ? <CreditsPanel /> : null}
      </div>
    </div>
  );
}
