import type { ContextMenu, ContextVerb } from "@jgengine/core/interaction/contextMenu";
import type { ScreenRect } from "@jgengine/core/scene/selection";

export function MarqueeBox({ rect }: { rect: ScreenRect }) {
  return (
    <div
      className="pointer-events-none absolute z-40 rounded-sm border border-emerald-300/80 bg-emerald-300/15"
      style={{
        left: rect.minX,
        top: rect.minY,
        width: rect.maxX - rect.minX,
        height: rect.maxY - rect.minY,
      }}
    />
  );
}

export function ContextMenuView({
  menu,
  x,
  y,
  onPick,
  onClose,
}: {
  menu: ContextMenu;
  x: number;
  y: number;
  onPick: (verb: ContextVerb) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} onContextMenu={(event) => event.preventDefault()} />
      <div
        className="pointer-events-auto absolute z-50 min-w-40 overflow-hidden rounded-md border border-white/15 bg-neutral-900/95 py-1 shadow-2xl backdrop-blur-sm"
        style={{ left: x, top: y }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
          {menu.kind === "entity" ? "Unit" : "Object"}
        </div>
        {menu.verbs.map((verb, index) => (
          <button
            key={`${verb.command}-${index}`}
            type="button"
            disabled={verb.disabled === true}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (verb.disabled === true) return;
              onPick(verb);
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-[13px] text-white/85 hover:bg-emerald-400/20 hover:text-white disabled:cursor-not-allowed disabled:text-white/30 disabled:hover:bg-transparent"
          >
            {verb.label}
          </button>
        ))}
      </div>
    </>
  );
}
