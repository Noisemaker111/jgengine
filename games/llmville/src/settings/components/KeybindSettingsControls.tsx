import { cn } from "@/components/ui/cn";
import {
  formatBindableKeyLabel,
  KEYBIND_ACTIONS,
  KEYBIND_SLOT,
  useAppSettings,
  useKeybindEditor,
} from "@/settings/settings";

interface KeybindSettingsControlsProps {
  compact?: boolean;
}

export function KeybindSettingsControls({ compact = false }: KeybindSettingsControlsProps) {
  const { keybinds, setKeybind, resetKeybinds } = useAppSettings();
  const { editing, startEditing, stopEditing } = useKeybindEditor(setKeybind);

  return (
    <section className={cn(compact ? "space-y-3" : "space-y-4")}>
      <div className="flex items-center justify-between gap-4">
        <p className={cn("font-game font-bold text-brand-cream", compact ? "text-sm" : "text-base")}>
          Keybinds
        </p>
        <button
          type="button"
          onClick={() => {
            stopEditing();
            resetKeybinds();
          }}
          className={cn(
            "shrink-0 rounded-lg border border-[var(--surface-border)] bg-black/20 px-3 py-1.5 font-game text-brand-cream/55 transition-colors hover:border-[var(--surface-border-strong)] hover:text-brand-cream/85",
            compact ? "text-[10px]" : "text-xs",
          )}
        >
          Reset All
        </button>
      </div>

      {editing !== null && (
        <div className="flex items-center gap-2.5 rounded-lg border border-brand-teal/30 bg-brand-teal/10 px-3 py-2.5">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-teal" />
          <p className="text-[11px] text-brand-cream/85">
            Listening for <span className="font-semibold">{KEYBIND_ACTIONS.find((action) => action.id === editing.actionId)?.label ?? "action"}</span> ({editing.slot}) — press any supported key or <kbd className="rounded border border-brand-teal/30 bg-brand-teal/10 px-1 py-0.5 text-[10px]">Esc</kbd> to cancel.
          </p>
        </div>
      )}

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3">
        <span className="text-[9px] font-game uppercase tracking-[0.2em] text-white/30">Action</span>
        <span className="w-16 text-center text-[9px] font-game uppercase tracking-[0.2em] text-white/30">Primary</span>
        <span className="w-16 text-center text-[9px] font-game uppercase tracking-[0.2em] text-white/30">Alt</span>
        <span className="w-10 text-center text-[9px] font-game uppercase tracking-[0.2em] text-white/30" />
      </div>

      <div className="rounded-xl border border-white/8 bg-black/20 divide-y divide-white/6">
        {KEYBIND_ACTIONS.map((action) => {
          const keybind = keybinds[action.id];
          const editingPrimary = editing?.actionId === action.id && editing.slot === KEYBIND_SLOT.primary;
          const editingSecondary = editing?.actionId === action.id && editing.slot === KEYBIND_SLOT.secondary;

          return (
            <div key={action.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className={cn("font-medium text-white", compact ? "text-[11px]" : "text-xs")}>{action.label}</p>
              </div>
              <button
                type="button"
                onClick={() => startEditing({ actionId: action.id, slot: KEYBIND_SLOT.primary })}
                className={cn(
                  "w-16 rounded-md border px-1.5 py-1 text-center font-game uppercase transition-colors",
                  compact ? "text-[9px] tracking-[0.1em]" : "text-[10px] tracking-[0.12em]",
                  editingPrimary
                    ? "border-brand-teal/50 bg-brand-teal/15 text-brand-cream"
                    : "border-[var(--surface-border)] bg-[#0f1715]/70 text-brand-cream/75 hover:border-[var(--surface-border-strong)] hover:text-brand-cream",
                )}
              >
                {formatBindableKeyLabel(keybind.primary)}
              </button>
              <button
                type="button"
                onClick={() => startEditing({ actionId: action.id, slot: KEYBIND_SLOT.secondary })}
                className={cn(
                  "w-16 rounded-md border px-1.5 py-1 text-center font-game uppercase transition-colors",
                  compact ? "text-[9px] tracking-[0.1em]" : "text-[10px] tracking-[0.12em]",
                  editingSecondary
                    ? "border-brand-teal/50 bg-brand-teal/15 text-brand-cream"
                    : keybind.secondary
                      ? "border-[var(--surface-border)] bg-[#0f1715]/50 text-brand-cream/55 hover:border-[var(--surface-border-strong)] hover:text-brand-cream/85"
                      : "border-dashed border-[var(--surface-border)] bg-transparent text-brand-cream/30 hover:border-[var(--surface-border-strong)] hover:text-brand-cream/55",
                )}
              >
                {formatBindableKeyLabel(keybind.secondary)}
              </button>
              <button
                type="button"
                onClick={() => setKeybind(action.id, KEYBIND_SLOT.secondary, null)}
                disabled={keybind.secondary === null}
                className="w-10 rounded-md border border-white/8 bg-transparent px-1.5 py-1 text-center text-[9px] font-game uppercase text-white/30 transition-colors hover:border-white/15 hover:text-white/60 disabled:opacity-0"
              >
                Clr
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
