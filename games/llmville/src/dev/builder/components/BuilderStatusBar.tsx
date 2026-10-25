import { Camera, Move3d } from "lucide-react";
import { useState } from "react";

import { BuilderIcon } from "@/dev/builder/components/builderIcons";
import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import { requestBuilderScreenshotCapture } from "@/dev/builder/components/SceneCapture";
import { getBuilderSelectionBounds, useBuilderState } from "@/dev/builder/builderStore";
import { getMapGrid } from "@llmville/game/builder/document";

export function BuilderStatusBar() {
  const state = useBuilderState();
  const [captureState, setCaptureState] = useState<"idle" | "pending" | "done">("idle");
  const bounds = getBuilderSelectionBounds(state.mapData, state.selectedRefs);
  const floor = state.mapData.environment.floor;
  const grid = getMapGrid(state.mapData);
  const walls = state.mapData.walls.length;
  const decorCount = state.mapData.decor.filter((item) => item.id !== undefined).length;

  return (
    <footer className={BUILDER_CSS.statusBar}>
      <span className="flex items-center gap-1.5">
        <span className={BUILDER_CSS.statusDot} aria-hidden />
        <span className="font-mono text-[11px]">
          {state.editingScope === "isolated"
            ? `Stage ${floor.width.toFixed(1)}×${floor.depth.toFixed(1)}m`
            : `Room ${floor.width.toFixed(1)}×${floor.depth.toFixed(1)}m`}
        </span>
      </span>
      <span className="text-[var(--brand-cream-dim)]/60">·</span>
      <span className="flex items-center gap-1">
        <BuilderIcon id="wall" size="sm" className="h-3 w-3" />
        {walls} wall{walls === 1 ? "" : "s"}
      </span>
      <span className="text-[var(--brand-cream-dim)]/60">·</span>
      <span className="flex items-center gap-1">
        <BuilderIcon id="place" size="sm" className="h-3 w-3" />
        {decorCount} object{decorCount === 1 ? "" : "s"}
      </span>
      <span className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1">
          <BuilderIcon id="select" size="sm" className="h-3 w-3" />
          {state.selectedRefs.length === 0
            ? "Nothing selected"
            : state.selectedRefs.length === 1
              ? labelForRef(state.selectedRefs[0])
              : `${state.selectedRefs.length} selected`}
        </span>
        {bounds ? (
          <span className="flex items-center gap-1 font-mono">
            <Move3d className="h-3 w-3" />
            {format(bounds.maxX - bounds.minX)}×{format(bounds.maxY - bounds.minY)}×{format(bounds.maxZ - bounds.minZ)}m
          </span>
        ) : null}
        <button
          type="button"
          className="hidden items-center gap-1 rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-[var(--brand-cream-dim)] transition hover:bg-black/45 sm:inline-flex"
          title="Capture viewport + preset angles for coding agents (POST /screenshot/request)"
          onClick={() => {
            setCaptureState("pending");
            void requestBuilderScreenshotCapture().then((result) => {
              setCaptureState(result ? "done" : "idle");
              if (result) window.setTimeout(() => setCaptureState("idle"), 2500);
            });
          }}
        >
          <Camera className="h-3 w-3" />
          {captureState === "pending" ? "capturing…" : captureState === "done" ? "captured" : "capture"}
        </button>
        <span className="rounded bg-black/30 px-1.5 font-mono text-[10px] text-[var(--brand-cream-dim)]">
          grid {grid.tileSize}m
        </span>
      </span>
    </footer>
  );
}

function labelForRef(ref: { kind: "decor" | "wall"; id?: string; index?: number }): string {
  if (ref.kind === "decor") return `Decor ${ref.id ?? "?"}`;
  return `Wall ${(ref.index ?? 0) + 1}`;
}

function format(value: number): string {
  return value.toFixed(value < 1 ? 2 : 1);
}
