import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

import { cn } from "@/components/ui/cn";
import { SettingsTabPanels } from "@/settings/components/SettingsTabPanels";
import type { SettingsTabId } from "@/settings/settings";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
  headerActionLabel?: string;
  onHeaderAction?: () => void;
}

export function SettingsModal({
  open,
  onClose,
  activeTab,
  onTabChange,
  headerActionLabel,
  onHeaderAction,
}: SettingsModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
    } else {
      const t = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!visible && !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className={cn(
        "fixed inset-0 z-[80] flex items-center justify-center p-4 transition-all duration-200",
        open ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className={cn(
          "game-panel-surface game-panel-surface--terminal relative z-10 flex w-full max-w-2xl flex-col overflow-hidden transition-all duration-200",
          open ? "translate-y-0 scale-100" : "translate-y-4 scale-[0.97]",
        )}
        style={{ height: "min(720px, calc(100vh - 2rem))" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 px-5 py-4">
          <h2 id="settings-modal-title" className="font-game text-lg font-extrabold text-brand-cream">Settings</h2>
          <div className="flex items-center gap-2">
            {headerActionLabel !== undefined && onHeaderAction !== undefined && (
              <button
                type="button"
                onClick={onHeaderAction}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-game text-[10px] uppercase tracking-[0.18em] text-white/70 transition-colors hover:border-white/20 hover:text-white"
              >
                {headerActionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/50 transition-colors hover:border-white/20 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Close settings</span>
            </button>
          </div>
        </div>

        <SettingsTabPanels
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      </div>
    </div>,
    document.body,
  );
}
