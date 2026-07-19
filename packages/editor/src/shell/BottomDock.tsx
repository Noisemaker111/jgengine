import { useSyncExternalStore, type ReactNode } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";

import type { EditorAssetEntry } from "../AssetBrowser";
import { AgentPanel } from "../agent/AgentPanel";
import type { EditorHostApi } from "../session";
import type { EditorUiStore } from "../uiStore";
import { AnimationPanel } from "./AnimationPanel";
import { ConsolePanel } from "./ConsolePanel";
import { ContentBrowser } from "./ContentBrowser";
import { ProfilerPanel } from "./ProfilerPanel";
import type { EditorConsoleStore } from "./consoleStore";
import type { BottomDockTab, BrowserViewMode } from "./layoutStore";
import type { PerfHistoryStore } from "./perfHistory";
import { BORDER } from "./theme";
import { IconButton, PanelTabs } from "./ui";

/**
 * Tabbed bottom dock: Content Browser, Console, Profiler, Animation (path flythrough scrub),
 * and the AI Assistant. Only the active tab's panel mounts, so hidden tools cost nothing per frame.
 */
export function BottomDock({
  tab,
  onSelectTab,
  onClose,
  assets,
  session,
  api,
  ui,
  consoleStore,
  perfHistory,
  browserView,
  onSetBrowserView,
  onPlaceAsset,
  onImportModels,
  importBusy,
}: {
  tab: BottomDockTab;
  onSelectTab: (tab: BottomDockTab) => void;
  onClose: () => void;
  assets: readonly EditorAssetEntry[];
  session: EditorSession;
  api: EditorHostApi;
  ui: EditorUiStore;
  consoleStore: EditorConsoleStore;
  perfHistory: PerfHistoryStore;
  browserView: BrowserViewMode;
  onSetBrowserView: (view: BrowserViewMode) => void;
  onPlaceAsset: (entry: EditorAssetEntry) => void;
  onImportModels?: (files: readonly File[]) => void | Promise<void>;
  importBusy?: boolean;
}) {
  const consoleEntries = useSyncExternalStore(consoleStore.subscribe, consoleStore.getEntries, consoleStore.getEntries);
  const consoleErrorCount = consoleEntries.reduce((sum, entry) => (entry.severity === "error" ? sum + 1 : sum), 0);
  let content: ReactNode;
  if (tab === "content") {
    content = (
      <ContentBrowser
        assets={assets}
        session={session}
        onPlace={onPlaceAsset}
        view={browserView}
        onSetView={onSetBrowserView}
        {...(onImportModels === undefined ? {} : { onImportModels, importBusy })}
      />
    );
  } else if (tab === "console") {
    content = <ConsolePanel store={consoleStore} />;
  } else if (tab === "profiler") {
    content = <ProfilerPanel history={perfHistory} />;
  } else if (tab === "animation") {
    content = <AnimationPanel session={session} api={api} ui={ui} assets={assets} />;
  } else {
    content = <AgentPanel api={api} embedded />;
  }

  return (
    <section
      className={`pointer-events-auto flex min-h-0 flex-1 flex-col border-t ${BORDER} bg-[#111318]`}
      aria-label="Bottom tool dock"
    >
      <PanelTabs
        ariaLabel="Bottom dock tools"
        active={tab}
        onSelect={onSelectTab}
        tabs={[
          { id: "content", label: "Content Browser", icon: "image", badge: assets.length },
          { id: "console", label: "Console", icon: "terminal", ...(consoleErrorCount > 0 ? { badge: consoleErrorCount } : {}) },
          { id: "profiler", label: "Profiler", icon: "gauge" },
          { id: "animation", label: "Animation", icon: "film" },
          { id: "assistant", label: "AI Assistant", icon: "sparkle" },
        ]}
        trailing={<IconButton icon="chevronDown" label="Collapse bottom dock" size={12} tone="ghost" onClick={onClose} />}
      />
      <div className="flex min-h-0 flex-1 flex-col">{content}</div>
    </section>
  );
}
