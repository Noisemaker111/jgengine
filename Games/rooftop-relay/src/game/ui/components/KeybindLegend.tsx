import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";

function moveClusterLabel(): string {
  const parts = (["moveForward", "moveLeft", "moveBack", "moveRight"] as const).map(
    (action) => actionLabel(keybinds, action) ?? "?",
  );
  return parts.join("");
}

const ROWS: readonly { key: string; text: string; label: string }[] = [
  { key: "move", text: "Move", label: moveClusterLabel() },
  { key: "jump", text: "Jump", label: actionLabel(keybinds, "jump") ?? "—" },
  { key: "sprint", text: "Sprint", label: actionLabel(keybinds, "sprint") ?? "—" },
  { key: "handoff", text: "Handoff in zone", label: actionLabel(keybinds, "handoff") ?? "—" },
  { key: "restart", text: "Restart run", label: actionLabel(keybinds, "restart") ?? "—" },
];

export function KeybindLegend({ className }: { className?: string }) {
  return (
    <ul className={className}>
      {ROWS.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3 text-xs text-[#c9c4b8]">
          <span>{row.text}</span>
          <span className="rounded border border-[#c9c4b8]/40 bg-black/40 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#f2b950]">
            {row.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
