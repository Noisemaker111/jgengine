import { MenuList, type MenuEntry } from "@/components/ui/menu-list";

const OVERLAY_BACKGROUND = "radial-gradient(circle, transparent 0%, rgba(0,0,0,0.78) 100%), rgba(0,0,0,0.45)";
const HUD_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.55)";

function AccentRule({ width = 120 }: { width?: number | string }) {
  return (
    <span
      className="block h-0.5"
      style={{
        width,
        background:
          "linear-gradient(90deg, transparent 0%, var(--jg-accent) 18%, var(--jg-accent) 82%, transparent 100%)",
        boxShadow: "0 0 8px var(--jg-accent-glow)",
      }}
    />
  );
}

export function PauseScreen({
  entries,
  selectedId,
  onSelect,
  onActivate,
  title = "Paused",
  open = true,
  className,
}: {
  entries: readonly MenuEntry[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onActivate?: (id: string) => void;
  title?: string;
  open?: boolean;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className={`pointer-events-auto absolute inset-0 overflow-hidden ${className ?? ""}`} data-jg="pause-screen">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: OVERLAY_BACKGROUND, backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      />
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-3.5">
          <h1
            className="m-0 text-[30px] font-extrabold uppercase tracking-[0.3em]"
            style={{ fontFamily: "var(--jg-font-display)", color: "var(--jg-text)", textShadow: HUD_TEXT_SHADOW }}
          >
            {title}
          </h1>
          <AccentRule width={200} />
        </div>
        <MenuList entries={entries} selectedId={selectedId} onSelect={onSelect} onActivate={onActivate} />
      </div>
    </div>
  );
}
