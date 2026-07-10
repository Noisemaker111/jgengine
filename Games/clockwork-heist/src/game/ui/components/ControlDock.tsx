import type { ReactNode } from "react";
import { useGame } from "@jgengine/react/hooks";

export function ControlDock(): ReactNode {
  const { commands } = useGame();
  return (
    <div className="pointer-events-auto flex gap-2">
      <DockButton k="Tab" label="Schedule" onClick={() => commands.run("ui.schedule", {})} />
      <DockButton k="R" label="Restart" onClick={() => commands.run("restart", {})} />
    </div>
  );
}

function DockButton({ k, label, onClick }: { k: string; label: string; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[48px] items-center gap-2 rounded border border-[#c9a227]/60 bg-[#0b0f1c]/85 px-3 py-2 text-xs uppercase tracking-wide text-[#e5d9c3] transition hover:bg-[#1d2b4a]"
    >
      <kbd className="rounded border border-[#c9a227]/60 bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-[#c9a227]">
        {k}
      </kbd>
      {label}
    </button>
  );
}
