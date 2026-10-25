import { MessageCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import { BuilderStatusBar } from "@/dev/builder/components/BuilderStatusBar";
import { BuilderChatPanel } from "@/dev/builder/components/BuilderChatPanel";
import { BuilderHeader } from "@/dev/builder/components/BuilderHeader";
import { BuilderSidebar } from "@/dev/builder/components/BuilderSidebar";
import { BuilderCanvasContextMenu, type BuilderCanvasContextMenuState } from "@/dev/builder/components/BuilderCanvasContextMenu";
import { PropertiesPanel } from "@/dev/builder/components/PropertiesPanel";
import { Viewport } from "@/dev/builder/components/Viewport";
import { useBuilderShortcuts } from "@/dev/builder/components/useBuilderShortcuts";
import { BuilderStore } from "@/dev/builder/builderStore";
import { startExecutorBridge } from "@/dev/builder/executorBridge";
import { cn } from "@/components/ui/cn";
import type { MaterialRegistry } from "@llmville/game/world/mapTypes";

export function BuildWorkbench() {
  const [contextMenu, setContextMenu] = useState<BuilderCanvasContextMenuState | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useBuilderShortcuts();

  useEffect(() => {
    BuilderStore.hydrateBrowserLibrary();
    void fetch("/materials.json")
      .then((response) => response.ok ? response.json() as Promise<MaterialRegistry> : {})
      .then((materials) => BuilderStore.setMaterialRegistry(materials))
      .catch(() => BuilderStore.setMaterialRegistry({}));

    const persistSession = () => BuilderStore.persistSession();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") persistSession();
    };
    window.addEventListener("beforeunload", persistSession);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      persistSession();
      window.removeEventListener("beforeunload", persistSession);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Live any time /dev/build is open, independent of whether the chat panel
  // is toggled open — the HTTP/OpenAPI surface (via Executor) must work even
  // when a user never opens the in-app chat panel.
  useEffect(() => {
    startExecutorBridge();
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const copyAfter = useCallback((action: () => void) => {
    action();
    const value = BuilderStore.getState().lastExport;
    if (value) void navigator.clipboard.writeText(value);
  }, []);

  return (
    <div className={BUILDER_CSS.shell}>
      <BuilderHeader />
      <div className="flex min-h-0 flex-1">
        <BuilderSidebar />
        <Viewport onContextMenuRequest={setContextMenu} />
        <PropertiesPanel />
        {chatOpen ? <BuilderChatPanel onClose={() => setChatOpen(false)} /> : null}
        <aside className={cn(BUILDER_CSS.toolRail, "w-10 border-l border-r-0")} aria-label="Builder side panels">
          <button
            type="button"
            onClick={() => setChatOpen((open) => !open)}
            className={cn(BUILDER_CSS.toolButton, chatOpen && BUILDER_CSS.toolButtonActive)}
            aria-pressed={chatOpen}
            aria-label="Toggle scene chat"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        </aside>
      </div>
      <BuilderStatusBar />
      {contextMenu ? (
        <BuilderCanvasContextMenu
          menu={contextMenu}
          copyAfter={copyAfter}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
