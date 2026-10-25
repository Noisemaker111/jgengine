import { useRef, useState } from "react";

import { cn } from "@/components/ui/cn";
import { AppSettingsControls } from "@/settings/components/AppSettingsControls";
import { Panel } from "@/components/ui/panel";
import { SETTINGS_TAB_ID, SETTINGS_TABS, type SettingsTabId } from "@/settings/settings";

function GeneralPanel() {
  return <AppSettingsControls compact generalOnly />;
}

function VideoPanel() {
  return <AppSettingsControls videoOnly compact />;
}

function SoundPanel() {
  return (
    <Panel variant="inset" className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <svg className="h-6 w-6 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
        </svg>
      </div>
      <div>
        <p className="font-game text-sm font-semibold text-brand-cream/70">Sound settings coming soon</p>
        <p className="mt-1 text-xs text-brand-cream/45">Volume controls and audio options will live here.</p>
      </div>
    </Panel>
  );
}

function KeybindsPanel() {
  return <AppSettingsControls keybindsOnly compact />;
}

function CreditsPanel() {
  const credits: { role: string; name: string }[] = [
    { role: "Game Design & Development", name: "The LLMville Team" },
    { role: "3D Engine & Rendering", name: "Three.js" },
    { role: "Backend & Sync", name: "Convex" },
    { role: "UI Framework", name: "React + Vite" },
    { role: "Routing", name: "TanStack Router" },
    { role: "Styling", name: "Tailwind CSS" },
  ];

  return (
    <div className="space-y-4">
      <Panel variant="inset" className="divide-y divide-[var(--surface-border)] p-0">
        {credits.map(({ role, name }) => (
          <div key={role} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-xs uppercase tracking-[0.14em] text-brand-cream/45">{role}</span>
            <span className="font-game text-sm text-brand-cream/80">{name}</span>
          </div>
        ))}
      </Panel>
      <p className="text-center text-xs text-brand-cream/40">Build something great.</p>
    </div>
  );
}

interface SettingsTabPanelsProps {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
  headerActionLabel?: string;
  onHeaderAction?: () => void;
  /** Tablet shell: tighter tabs and no outer title row. */
  embedded?: boolean;
}

export function SettingsTabPanels({
  activeTab,
  onTabChange,
  headerActionLabel,
  onHeaderAction,
  embedded = false,
}: SettingsTabPanelsProps) {
  const [prevTab, setPrevTab] = useState<SettingsTabId | null>(null);
  const [animating, setAnimating] = useState(false);
  const scrollRefs = useRef<Partial<Record<SettingsTabId, HTMLDivElement | null>>>({});

  function switchTab(next: SettingsTabId) {
    if (next === activeTab || animating) return;
    setPrevTab(activeTab);
    onTabChange(next);
    setAnimating(true);
    setTimeout(() => {
      setPrevTab(null);
      setAnimating(false);
    }, 260);
    setTimeout(() => {
      scrollRefs.current[next]?.scrollTo({ top: 0, behavior: "instant" });
    }, 0);
  }

  const tabIndex = SETTINGS_TABS.findIndex((t) => t.id === activeTab);
  const prevTabIndex = prevTab ? SETTINGS_TABS.findIndex((t) => t.id === prevTab) : -1;
  const slideDir = prevTabIndex !== -1 ? (tabIndex > prevTabIndex ? 1 : -1) : 0;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", embedded ? "bg-zinc-950" : "")}>
      {!embedded && headerActionLabel !== undefined && onHeaderAction !== undefined && (
        <div className="flex shrink-0 justify-end px-4 pb-2">
          <button
            type="button"
            onClick={onHeaderAction}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-game text-[10px] uppercase tracking-[0.18em] text-white/70 transition-colors hover:border-white/20 hover:text-white"
          >
            {headerActionLabel}
          </button>
        </div>
      )}

      <div className={cn("shrink-0 border-b border-white/8", embedded ? "bg-zinc-950" : "bg-black/20 px-1")}>
        <div className={cn("flex items-end overflow-x-auto scrollbar-none", embedded ? "px-2" : "")}>
          {SETTINGS_TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`settings-panel-${tab.id}`}
                id={`settings-tab-${tab.id}`}
                onClick={() => switchTab(tab.id)}
                className={cn(
                  "relative shrink-0 px-3 py-2.5 font-game text-[10px] uppercase tracking-[0.18em] transition-colors duration-150 max-sm:px-2.5",
                  isActive ? "text-white" : "text-white/35 hover:text-white/65",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-[var(--game-green)] transition-all duration-200",
                    isActive ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0",
                  )}
                  style={{ transformOrigin: "left" }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {SETTINGS_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const isExiting = tab.id === prevTab;
          if (!isActive && !isExiting) return null;

          return (
            <div
              key={tab.id}
              id={`settings-panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`settings-tab-${tab.id}`}
              hidden={!isActive}
              ref={(el) => { scrollRefs.current[tab.id] = el; }}
              className="absolute inset-0 overflow-y-auto overscroll-contain scrollbar-none"
              style={{
                transform: isActive && animating
                  ? `translateX(${slideDir * -16}px)`
                  : isExiting
                    ? `translateX(${slideDir * 16}px)`
                    : "translateX(0)",
                opacity: isActive ? 1 : 0,
                transition: "transform 260ms cubic-bezier(0.32,0,0.2,1), opacity 220ms ease",
                pointerEvents: isActive ? "auto" : "none",
              }}
            >
              <div className={cn(embedded ? "px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]" : "px-5 py-5")}>
                {embedded && headerActionLabel !== undefined && onHeaderAction !== undefined && (
                  <div className="mb-3 flex justify-end">
                    <button
                      type="button"
                      onClick={onHeaderAction}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 font-game text-[10px] uppercase tracking-[0.18em] text-white/80 transition-colors hover:border-white/20 hover:text-white"
                    >
                      {headerActionLabel}
                    </button>
                  </div>
                )}
                {tab.id === "general" && <GeneralPanel />}
                {tab.id === "video" && <VideoPanel />}
                {tab.id === "sound" && <SoundPanel />}
                {tab.id === SETTINGS_TAB_ID.keybinds && <KeybindsPanel />}
                {tab.id === "credits" && <CreditsPanel />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
