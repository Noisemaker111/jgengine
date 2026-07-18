import { useEffect, useRef, useState, type ReactNode } from "react";

import { WELL_KNOWN_MARKER_KINDS } from "@jgengine/core/editor/index";
import { VEGETATION_VOLUME_KIND } from "@jgengine/core/world/vegetation";
import { listSceneKinds } from "@jgengine/core/scene/sceneKinds";

import type { EditorTool, GizmoMode, PlacementTool, SnapMode } from "../uiStore";
import { Icon } from "./icons";
import { BORDER, FOCUS_RING, MICRO_LABEL } from "./theme";
import { IconButton, Segmented, ToolbarDivider } from "./ui";

/** Volume placement entries offered by the Add menu. */
export const ADD_VOLUME_ENTRIES: readonly { label: string; tool: PlacementTool }[] = [
  { label: "Zone (sphere)", tool: { tool: "volume", kind: "zone", shape: "sphere" } },
  { label: "Zone (box)", tool: { tool: "volume", kind: "zone", shape: "box" } },
  { label: "Zone (cylinder)", tool: { tool: "volume", kind: "zone", shape: "cylinder" } },
  { label: "Aggro range", tool: { tool: "volume", kind: "aggro", shape: "sphere" } },
  { label: "Leash range", tool: { tool: "volume", kind: "leash", shape: "sphere" } },
  { label: "Discover area", tool: { tool: "volume", kind: "discover", shape: "sphere" } },
  { label: "Capture area", tool: { tool: "volume", kind: "capture", shape: "cylinder" } },
  { label: "Vegetation (box)", tool: { tool: "volume", kind: VEGETATION_VOLUME_KIND, shape: "box" } },
  { label: "Vegetation (circle)", tool: { tool: "volume", kind: VEGETATION_VOLUME_KIND, shape: "sphere" } },
];

const GRID_SIZES: readonly number[] = [0.5, 1, 2, 4, 8];

function MenuShell({
  open,
  onClose,
  children,
  width = "w-56",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute left-0 top-8 z-[70] max-h-[56vh] ${width} overflow-auto rounded-[8px] border border-white/10 bg-[#14171d] p-1.5 shadow-2xl shadow-black/60`}
    >
      {children}
    </div>
  );
}

const MENU_ITEM =
  `block w-full rounded-[5px] px-2.5 py-1.5 text-left text-[12px] text-neutral-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-100 ${FOCUS_RING}`;

/**
 * Contextual scene toolbar under the app bar: tools, gizmo modes, snapping, viewport overlays,
 * framing, and the Add menu. Unsupported controls (local space, pivot, ortho projection,
 * rotation/scale snap) render disabled rather than pretending to work.
 */
export function SceneToolbar({
  tool,
  gizmoMode,
  snapMode,
  gridSize,
  showGrid,
  showContours,
  showSurfaceGrid,
  showElevation,
  placementActive,
  onSetTool,
  onSetGizmoMode,
  onSetSnapMode,
  onSetGridSize,
  onToggleGrid,
  onToggleContours,
  onToggleSurfaceGrid,
  onToggleElevation,
  onFrame,
  onStartPlacement,
  onOpenAssistant,
  assistantOpen,
}: {
  tool: EditorTool;
  gizmoMode: GizmoMode;
  snapMode: SnapMode;
  gridSize: number;
  showGrid: boolean;
  showContours: boolean;
  showSurfaceGrid: boolean;
  showElevation: boolean;
  placementActive: boolean;
  onSetTool: (tool: EditorTool) => void;
  onSetGizmoMode: (mode: GizmoMode) => void;
  onSetSnapMode: (mode: SnapMode) => void;
  onSetGridSize: (size: number) => void;
  onToggleGrid: () => void;
  onToggleContours: () => void;
  onToggleSurfaceGrid: () => void;
  onToggleElevation: () => void;
  onFrame: () => void;
  onStartPlacement: (tool: PlacementTool) => void;
  onOpenAssistant: () => void;
  assistantOpen: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const lastSnapRef = useRef<Exclude<SnapMode, "off">>("ground");
  if (snapMode !== "off") lastSnapRef.current = snapMode;

  // Recomputed every render (opening the menu rerenders): studios may register after the chrome
  // mounts (game modules load lazily), and a once-on-mount snapshot would silently hide them.
  const studioKinds = listSceneKinds().filter((definition) => definition.addCategory !== undefined);

  const pick = (placement: PlacementTool) => {
    setAddOpen(false);
    onStartPlacement(placement);
  };

  return (
    <div
      className={`pointer-events-auto relative z-[55] flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b ${BORDER} bg-[#0e1014] px-2 [scrollbar-width:none]`}
      role="toolbar"
      aria-label="Scene tools"
    >
      <Segmented
        ariaLabel="Editing tool"
        value={tool}
        onChange={onSetTool}
        options={[
          { value: "select", label: "Select", icon: "cursor" },
          { value: "terrain", label: "Terrain", icon: "terrain", kbd: "T" },
        ]}
      />
      <ToolbarDivider />
      <Segmented
        ariaLabel="Transform gizmo"
        value={gizmoMode}
        onChange={onSetGizmoMode}
        disabled={tool === "terrain"}
        options={[
          { value: "translate", label: "Move", icon: "move", kbd: "W", iconOnly: true },
          { value: "rotate", label: "Rotate", icon: "rotate", kbd: "E", iconOnly: true },
          { value: "scale", label: "Scale", icon: "scale", kbd: "R", iconOnly: true },
        ]}
      />
      <div
        className="flex h-6 items-center gap-1 rounded-[5px] border border-white/[0.06] bg-black/20 px-2 text-[11px] text-neutral-600"
        title="Gizmo operates in world space with center pivot — local space and pivot modes are planned"
        aria-disabled="true"
      >
        <Icon name="target" size={12} />
        World · Pivot
      </div>
      <ToolbarDivider />
      <div className="relative flex items-center gap-1">
        <IconButton
          icon="magnet"
          label={snapMode === "off" ? "Enable snapping" : `Snapping: ${snapMode}`}
          active={snapMode !== "off"}
          onClick={() => onSetSnapMode(snapMode === "off" ? lastSnapRef.current : "off")}
        />
        <button
          type="button"
          onClick={() => setSnapOpen((value) => !value)}
          aria-label="Snapping options"
          aria-expanded={snapOpen}
          className={`flex h-7 items-center gap-1 rounded-[5px] border border-white/[0.07] bg-[#191d24] px-2 text-[11px] text-neutral-300 transition-colors hover:bg-[#1f242d] ${FOCUS_RING}`}
        >
          {snapMode === "off" ? "Snap off" : snapMode === "grid" ? `Grid ${gridSize}m` : "Ground"}
          <Icon name="chevronDown" size={10} className="text-neutral-500" />
        </button>
        <MenuShell open={snapOpen} onClose={() => setSnapOpen(false)} width="w-52">
          <div className={`px-2 pb-1 pt-1.5 ${MICRO_LABEL}`}>Translation snap</div>
          {(["ground", "grid", "off"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`${MENU_ITEM} ${snapMode === mode ? "text-cyan-200" : ""}`}
              onClick={() => {
                onSetSnapMode(mode);
                if (mode !== "grid") setSnapOpen(false);
              }}
            >
              {mode === "ground" ? "Snap to ground" : mode === "grid" ? "Snap to grid" : "Snapping off"}
              {snapMode === mode ? " ✓" : ""}
            </button>
          ))}
          {snapMode === "grid" ? (
            <div className="flex items-center gap-1 px-2 py-1.5">
              {GRID_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    onSetGridSize(size);
                    setSnapOpen(false);
                  }}
                  className={`rounded-[4px] px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${FOCUS_RING} ${
                    gridSize === size ? "bg-cyan-500/20 text-cyan-100" : "bg-white/[0.05] text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {size}m
                </button>
              ))}
            </div>
          ) : null}
          <div className="my-1 h-px bg-white/[0.07]" />
          <div className="px-2.5 py-1 text-[11px] text-neutral-600" title="Planned — the gizmo currently snaps translation only">
            Rotation / scale snap — planned
          </div>
        </MenuShell>
      </div>
      <ToolbarDivider />
      <IconButton icon="grid" label="Reference grid (G)" active={showGrid} onClick={onToggleGrid} />
      <IconButton icon="terrain" label="Elevation contours" active={showContours} onClick={onToggleContours} />
      <IconButton icon="layers" label="Terrain-draped grid" active={showSurfaceGrid} onClick={onToggleSurfaceGrid} />
      <IconButton icon="gauge" label="Elevation readout" active={showElevation} onClick={onToggleElevation} />
      <ToolbarDivider />
      <IconButton icon="frame" label="Frame selection / scene (F)" onClick={onFrame} />
      <div
        className="flex h-6 items-center gap-1 rounded-[5px] border border-white/[0.06] bg-black/20 px-2 text-[11px] text-neutral-600"
        title="Perspective projection (orthographic view is planned)"
        aria-disabled="true"
      >
        <Icon name="camera" size={12} />
        Persp
      </div>
      <ToolbarDivider />
      <div className="relative">
        <button
          type="button"
          onClick={() => setAddOpen((value) => !value)}
          aria-expanded={addOpen}
          className={`flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors ${FOCUS_RING} ${
            addOpen || placementActive
              ? "bg-cyan-600 text-white shadow-sm shadow-cyan-950/40"
              : "border border-white/[0.07] bg-[#191d24] text-neutral-200 hover:bg-[#1f242d]"
          }`}
        >
          <Icon name="plus" size={12} />
          Add
        </button>
        <MenuShell open={addOpen} onClose={() => setAddOpen(false)}>
          <div className={`px-2 pb-1 pt-1.5 ${MICRO_LABEL}`}>Markers</div>
          {WELL_KNOWN_MARKER_KINDS.map((kind) => (
            <button key={kind} type="button" className={MENU_ITEM} onClick={() => pick({ tool: "marker", kind })}>
              {kind}
            </button>
          ))}
          <div className={`px-2 pb-1 pt-2 ${MICRO_LABEL}`}>Volumes</div>
          {ADD_VOLUME_ENTRIES.map((entry) => (
            <button key={entry.label} type="button" className={MENU_ITEM} onClick={() => pick(entry.tool)}>
              {entry.label}
            </button>
          ))}
          <div className={`px-2 pb-1 pt-2 ${MICRO_LABEL}`}>Studios</div>
          {studioKinds.map((definition) => (
            <button
              key={definition.kind}
              type="button"
              className={`${MENU_ITEM}`}
              style={{ color: definition.accent ?? "#34d399" }}
              onClick={() =>
                pick(
                  definition.target === "path"
                    ? { tool: "path", kind: definition.kind }
                    : definition.target === "volume"
                      ? { tool: "volume", kind: definition.kind, shape: "box" }
                      : { tool: "marker", kind: definition.kind },
                )
              }
            >
              {definition.label}
              {definition.target === "path" ? (definition.pathShape === "line" ? " (draw line)" : " (lasso)") : ""}
            </button>
          ))}
          <div className={`px-2 pb-1 pt-2 ${MICRO_LABEL}`}>Paths & notes</div>
          <button type="button" className={MENU_ITEM} onClick={() => pick({ tool: "path", kind: "route" })}>
            Draw path (route)
          </button>
          <button type="button" className={MENU_ITEM} onClick={() => pick({ tool: "path", kind: "road" })}>
            Draw road
          </button>
          <button type="button" className={MENU_ITEM} onClick={() => pick({ tool: "note" })}>
            Note
          </button>
        </MenuShell>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenAssistant}
          className={`flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] transition-colors ${FOCUS_RING} ${
            assistantOpen
              ? "border border-violet-400/40 bg-violet-500/20 text-violet-100"
              : "border border-white/[0.07] bg-[#191d24] text-neutral-300 hover:bg-[#1f242d] hover:text-neutral-100"
          }`}
          title="AI assistant — drives the scene through the same RPC and undo as the toolbar"
        >
          <Icon name="sparkle" size={13} />
          AI
        </button>
      </div>
    </div>
  );
}
