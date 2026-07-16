import type { EditorContextAction } from "./viewportContextMenu";

/**
 * @internal Headless chrome-skinned viewport context menu (#866). Parent owns placement and action dispatch.
 */
export function EditorContextMenu({
  x,
  y,
  actions,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  actions: readonly EditorContextAction[];
  onPick: (action: EditorContextAction) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="pointer-events-auto fixed inset-0 z-[60]"
        onPointerDown={onClose}
        onContextMenu={(event) => event.preventDefault()}
      />
      <div
        role="menu"
        className="pointer-events-auto fixed z-[61] min-w-44 overflow-hidden rounded-md border border-white/15 bg-neutral-900/95 py-1 shadow-2xl backdrop-blur-sm"
        style={{ left: x, top: y }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
          Editor
        </div>
        {actions.map((action, index) => (
          <div key={`${action.id}-${index}`}>
            {action.separatorBefore === true ? <div className="my-1 border-t border-white/10" /> : null}
            <button
              type="button"
              role="menuitem"
              disabled={action.disabled === true}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (action.disabled === true) return;
                onPick(action);
              }}
              className="flex w-full items-center px-3 py-1.5 text-left text-[13px] text-white/85 hover:bg-cyan-400/20 hover:text-white disabled:cursor-not-allowed disabled:text-white/30 disabled:hover:bg-transparent"
            >
              {action.label}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
