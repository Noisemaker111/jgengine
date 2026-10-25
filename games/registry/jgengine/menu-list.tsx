import { KeybindBadge } from "@/components/ui/keybind-badge";

const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

export interface MenuEntry {
  id: string;
  label: string;
  keybind?: string;
  disabled?: boolean;
}

export function MenuList({
  entries,
  selectedId,
  onSelect,
  onActivate,
  className,
}: {
  entries: readonly MenuEntry[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2.5 ${className ?? ""}`} data-jg="menu-list">
      {entries.map((entry) => {
        const selected = entry.id === selectedId;
        return (
          <div key={entry.id} data-jg="menu-row" className="flex flex-col gap-1">
            <button
              type="button"
              disabled={entry.disabled}
              onMouseEnter={() => {
                if (!entry.disabled) onSelect?.(entry.id);
              }}
              onFocus={() => {
                if (!entry.disabled) onSelect?.(entry.id);
              }}
              onClick={() => {
                if (!entry.disabled) onActivate?.(entry.id);
              }}
              className="flex items-center gap-2.5 border-none bg-transparent px-0 py-1 text-left"
              style={{
                cursor: entry.disabled === true ? "default" : "pointer",
                opacity: entry.disabled === true ? 0.35 : 1,
              }}
            >
              <span
                aria-hidden
                className="h-0 w-0 shrink-0"
                style={{
                  borderTop: "5px solid transparent",
                  borderBottom: "5px solid transparent",
                  borderLeft: `8px solid ${selected ? "var(--jg-accent)" : "transparent"}`,
                }}
              />
              <span
                className="text-[15px] font-bold uppercase tracking-[0.24em]"
                style={{
                  fontFamily: "var(--jg-font-display)",
                  color: selected ? "var(--jg-text)" : "var(--jg-text-dim)",
                  textShadow: selected ? `0 0 10px var(--jg-accent-glow), ${HUD_TEXT_SHADOW}` : HUD_TEXT_SHADOW,
                }}
              >
                {entry.label}
              </span>
              {entry.keybind !== undefined && <KeybindBadge label={entry.keybind} />}
            </button>
            {selected && (
              <span
                aria-hidden
                className="ml-[18px] h-0.5 w-7"
                style={{ background: "var(--jg-accent)", boxShadow: "0 0 6px var(--jg-accent-glow)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
