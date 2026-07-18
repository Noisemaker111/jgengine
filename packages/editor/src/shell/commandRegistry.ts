import { WELL_KNOWN_MARKER_KINDS } from "@jgengine/core/editor/index";
import { listSceneKinds } from "@jgengine/core/scene/sceneKinds";

import type { GizmoMode, PlacementTool, SnapMode } from "../uiStore";
import type { BottomDockTab } from "./layoutStore";

/** One executable command-palette entry. */
export interface PaletteCommand {
  id: string;
  title: string;
  group: string;
  kbd?: string;
  keywords?: string;
  run: () => void;
}

/** Everything the palette can drive — thin callbacks over existing editor systems. */
export interface PaletteContext {
  setGizmoMode(mode: GizmoMode): void;
  setTool(tool: "select" | "terrain"): void;
  toggleGrid(): void;
  toggleContours(): void;
  toggleSurfaceGrid(): void;
  toggleElevation(): void;
  setSnapMode(mode: SnapMode): void;
  frameAll(): void;
  frameSelection(): void;
  undo(): void;
  redo(): void;
  save(): void;
  exportJson(): void;
  importJson(): void;
  copyJson(): void;
  setMode(mode: "play" | "walk" | "hud"): void;
  startPlacement(tool: PlacementTool): void;
  openBottomTab(tab: BottomDockTab): void;
  toggleLeftDock(): void;
  toggleRightDock(): void;
  toggleHelp(): void;
  resetLayout(): void;
}

/** Builds the full palette command list from live editor capabilities — no dead entries. */
export function buildPaletteCommands(ctx: PaletteContext): PaletteCommand[] {
  const commands: PaletteCommand[] = [
    { id: "tool.select", title: "Select tool", group: "Tools", run: () => ctx.setTool("select") },
    { id: "tool.terrain", title: "Terrain sculpt/paint tool", group: "Tools", kbd: "T", run: () => ctx.setTool("terrain") },
    { id: "gizmo.translate", title: "Move gizmo", group: "Tools", kbd: "W", run: () => ctx.setGizmoMode("translate") },
    { id: "gizmo.rotate", title: "Rotate gizmo", group: "Tools", kbd: "E", run: () => ctx.setGizmoMode("rotate") },
    { id: "gizmo.scale", title: "Scale gizmo", group: "Tools", kbd: "R", run: () => ctx.setGizmoMode("scale") },
    { id: "snap.ground", title: "Snap to ground", group: "Snapping", run: () => ctx.setSnapMode("ground") },
    { id: "snap.grid", title: "Snap to grid", group: "Snapping", run: () => ctx.setSnapMode("grid") },
    { id: "snap.off", title: "Snapping off", group: "Snapping", run: () => ctx.setSnapMode("off") },
    { id: "view.grid", title: "Toggle reference grid", group: "View", kbd: "G", run: () => ctx.toggleGrid() },
    { id: "view.contours", title: "Toggle elevation contours", group: "View", run: () => ctx.toggleContours() },
    { id: "view.drape", title: "Toggle terrain-draped grid", group: "View", run: () => ctx.toggleSurfaceGrid() },
    { id: "view.elevation", title: "Toggle elevation readout", group: "View", run: () => ctx.toggleElevation() },
    { id: "view.frameAll", title: "Frame whole scene", group: "View", kbd: "F", run: () => ctx.frameAll() },
    { id: "view.frameSelection", title: "Frame selection", group: "View", kbd: "F", run: () => ctx.frameSelection() },
    { id: "edit.undo", title: "Undo", group: "Edit", kbd: "Ctrl+Z", run: () => ctx.undo() },
    { id: "edit.redo", title: "Redo", group: "Edit", kbd: "Ctrl+Y", run: () => ctx.redo() },
    { id: "doc.save", title: "Save scene", group: "Document", kbd: "Ctrl+S", run: () => ctx.save() },
    { id: "doc.export", title: "Export scene JSON", group: "Document", run: () => ctx.exportJson() },
    { id: "doc.import", title: "Import scene JSON…", group: "Document", run: () => ctx.importJson() },
    { id: "doc.copy", title: "Copy scene JSON to clipboard", group: "Document", run: () => ctx.copyJson() },
    { id: "mode.play", title: "Enter Play mode", group: "Modes", kbd: "F2+E", run: () => ctx.setMode("play") },
    { id: "mode.walk", title: "Enter Walk mode", group: "Modes", run: () => ctx.setMode("walk") },
    { id: "mode.hud", title: "Lay out HUD panels", group: "Modes", run: () => ctx.setMode("hud") },
    { id: "panel.content", title: "Open Content Browser", group: "Panels", kbd: "Ctrl+B", run: () => ctx.openBottomTab("content") },
    { id: "panel.console", title: "Open Console", group: "Panels", run: () => ctx.openBottomTab("console") },
    { id: "panel.profiler", title: "Open Profiler", group: "Panels", run: () => ctx.openBottomTab("profiler") },
    { id: "panel.assistant", title: "Open AI Assistant", group: "Panels", run: () => ctx.openBottomTab("assistant") },
    { id: "panel.left", title: "Toggle hierarchy panel", group: "Panels", run: () => ctx.toggleLeftDock() },
    { id: "panel.right", title: "Toggle inspector panel", group: "Panels", run: () => ctx.toggleRightDock() },
    { id: "panel.resetLayout", title: "Reset layout to defaults", group: "Panels", run: () => ctx.resetLayout() },
    { id: "help.shortcuts", title: "Keyboard shortcuts", group: "Help", kbd: "?", run: () => ctx.toggleHelp() },
  ];

  for (const kind of WELL_KNOWN_MARKER_KINDS) {
    commands.push({
      id: `add.marker.${kind}`,
      title: `Add marker: ${kind}`,
      group: "Add",
      keywords: "place create marker",
      run: () => ctx.startPlacement({ tool: "marker", kind }),
    });
  }
  for (const definition of listSceneKinds()) {
    if (definition.addCategory === undefined) continue;
    commands.push({
      id: `add.studio.${definition.kind}`,
      title: `Add ${definition.label}`,
      group: "Add",
      keywords: "place create studio",
      run: () =>
        ctx.startPlacement(
          definition.target === "path"
            ? { tool: "path", kind: definition.kind }
            : definition.target === "volume"
              ? { tool: "volume", kind: definition.kind, shape: "box" }
              : { tool: "marker", kind: definition.kind },
        ),
    });
  }
  commands.push(
    { id: "add.path", title: "Draw path (route)", group: "Add", keywords: "place create", run: () => ctx.startPlacement({ tool: "path", kind: "route" }) },
    { id: "add.road", title: "Draw road", group: "Add", keywords: "place create", run: () => ctx.startPlacement({ tool: "path", kind: "road" }) },
    { id: "add.zone", title: "Add zone volume", group: "Add", keywords: "place create volume", run: () => ctx.startPlacement({ tool: "volume", kind: "zone", shape: "sphere" }) },
    { id: "add.note", title: "Add note", group: "Add", keywords: "place create annotation", run: () => ctx.startPlacement({ tool: "note" }) },
  );
  return commands;
}

/** Case-insensitive subsequence-friendly filter over title, group, and keywords. */
export function filterPaletteCommands(
  commands: readonly PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...commands];
  const terms = needle.split(/\s+/);
  return commands.filter((command) => {
    const haystack = `${command.title} ${command.group} ${command.keywords ?? ""}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
