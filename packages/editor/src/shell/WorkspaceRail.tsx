import { Icon, type IconName } from "./icons";
import type { EditorWorkspace } from "./layoutStore";
import { BORDER, FOCUS_RING } from "./theme";

interface RailEntry {
  id: EditorWorkspace;
  label: string;
  icon: IconName;
  /** False renders the mode as a visibly disabled, planned workspace. */
  supported: boolean;
}

/** Rail order and support map. Unsupported modes are visible but disabled — never fake panels. */
export const WORKSPACES: readonly RailEntry[] = [
  { id: "scene", label: "Scene", icon: "cube", supported: true },
  { id: "terrain", label: "Terrain", icon: "terrain", supported: true },
  { id: "assets", label: "Assets", icon: "image", supported: true },
  { id: "materials", label: "Materials", icon: "sphere", supported: true },
  { id: "scripting", label: "Scripting", icon: "script", supported: false },
  { id: "animation", label: "Animation", icon: "film", supported: false },
  { id: "audio", label: "Audio", icon: "audio", supported: false },
  { id: "lighting", label: "Lighting", icon: "bulb", supported: true },
  { id: "ai", label: "AI", icon: "sparkle", supported: true },
  /** Presence/session inspection over host-supplied snapshot + game adapter config — never fabricated. */
  { id: "multiplayer", label: "Network", icon: "network", supported: true },
];

/**
 * Narrow left workspace rail. Supported modes activate their home panels; planned modes are
 * disabled with an explanatory tooltip so nothing pretends to work.
 */
export function WorkspaceRail({
  active,
  onSelect,
}: {
  active: EditorWorkspace;
  onSelect: (workspace: EditorWorkspace) => void;
}) {
  return (
    <nav
      aria-label="Workspaces"
      className={`pointer-events-auto flex w-13 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r ${BORDER} bg-[#0e1014] py-1.5 [scrollbar-width:none]`}
    >
      {WORKSPACES.map((entry) => {
        const selected = entry.id === active;
        return (
          <button
            key={entry.id}
            type="button"
            disabled={!entry.supported}
            aria-label={entry.supported ? `${entry.label} workspace` : `${entry.label} workspace — planned`}
            aria-current={selected ? "page" : undefined}
            title={entry.supported ? `${entry.label} workspace` : `${entry.label} — planned workspace`}
            onClick={() => onSelect(entry.id)}
            className={`relative flex w-11 flex-col items-center gap-0.5 rounded-[6px] py-1.5 transition-colors ${FOCUS_RING} ${
              selected
                ? "bg-cyan-500/15 text-cyan-200"
                : entry.supported
                  ? "text-neutral-500 hover:bg-white/[0.05] hover:text-neutral-300"
                  : "text-neutral-700"
            } disabled:pointer-events-none`}
          >
            {selected ? <span className="absolute -left-1 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-400" /> : null}
            <Icon name={entry.icon} size={16} />
            <span className="text-[9px] leading-none">{entry.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
