import { expect, test } from "bun:test";

import { buildPaletteCommands, filterPaletteCommands, type PaletteContext } from "./commandRegistry";
import { WORKSPACES } from "./WorkspaceRail";

function recordingContext(): { ctx: PaletteContext; calls: string[] } {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      void calls.push(`${name}:${args.map(String).join(",")}`);
  const ctx: PaletteContext = {
    setGizmoMode: record("gizmo"),
    setTool: record("tool"),
    toggleGrid: record("grid"),
    toggleContours: record("contours"),
    toggleSurfaceGrid: record("surfaceGrid"),
    toggleElevation: record("elevation"),
    setSnapMode: record("snap"),
    frameAll: record("frameAll"),
    frameSelection: record("frameSelection"),
    undo: record("undo"),
    redo: record("redo"),
    save: record("save"),
    exportJson: record("export"),
    importJson: record("import"),
    copyJson: record("copy"),
    setMode: record("mode"),
    startPlacement: (tool) => void calls.push(`place:${tool.tool}`),
    openBottomTab: record("bottomTab"),
    toggleLeftDock: record("leftDock"),
    toggleRightDock: record("rightDock"),
    toggleHelp: record("help"),
    resetLayout: record("resetLayout"),
  };
  return { ctx, calls };
}

test("buildPaletteCommands covers tools, view, document, modes, panels, and add flows", () => {
  const { ctx } = recordingContext();
  const commands = buildPaletteCommands(ctx);
  const ids = new Set(commands.map((command) => command.id));
  for (const id of [
    "tool.terrain",
    "gizmo.translate",
    "view.grid",
    "edit.undo",
    "doc.save",
    "mode.play",
    "panel.content",
    "panel.assistant",
    "panel.resetLayout",
    "add.path",
    "add.zone",
    "add.note",
  ]) {
    expect(ids.has(id)).toBe(true);
  }
  expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
});

test("palette commands run their wired context callbacks", () => {
  const { ctx, calls } = recordingContext();
  const commands = buildPaletteCommands(ctx);
  commands.find((command) => command.id === "gizmo.rotate")!.run();
  commands.find((command) => command.id === "panel.profiler")!.run();
  commands.find((command) => command.id === "add.zone")!.run();
  expect(calls).toEqual(["gizmo:rotate", "bottomTab:profiler", "place:volume"]);
});

test("filterPaletteCommands matches all terms across title, group, and keywords", () => {
  const { ctx } = recordingContext();
  const commands = buildPaletteCommands(ctx);
  expect(filterPaletteCommands(commands, "")).toHaveLength(commands.length);
  const gridMatches = filterPaletteCommands(commands, "toggle grid");
  expect(gridMatches.some((command) => command.id === "view.grid")).toBe(true);
  const placeMatches = filterPaletteCommands(commands, "place note");
  expect(placeMatches.some((command) => command.id === "add.note")).toBe(true);
  expect(filterPaletteCommands(commands, "zzz-nothing")).toHaveLength(0);
});

test("filterPaletteCommands floats recent ids to the top when the query is empty", () => {
  const { ctx } = recordingContext();
  const commands = buildPaletteCommands(ctx);
  const filtered = filterPaletteCommands(commands, "", ["doc.save", "view.grid"]);
  expect(filtered[0]?.id).toBe("doc.save");
  expect(filtered[0]?.group).toBe("Recent");
  expect(filtered[1]?.id).toBe("view.grid");
  expect(filtered.filter((command) => command.id === "doc.save")).toHaveLength(1);
});

test("buildPaletteCommands adds jump-to-object rows when objects are provided", () => {
  const { ctx, calls } = recordingContext();
  ctx.objects = [{ id: "boss", label: "Boss spawn", kind: "enemy_spawn" }];
  ctx.gotoObject = (id) => void calls.push(`goto:${id}`);
  const commands = buildPaletteCommands(ctx);
  const jump = commands.find((command) => command.id === "goto.object.boss");
  expect(jump?.title).toBe("Boss spawn");
  jump!.run();
  expect(calls).toContain("goto:boss");
});

test("workspace rail declares support honestly — staged modes are disabled", () => {
  const supported = WORKSPACES.filter((entry) => entry.supported).map((entry) => entry.id);
  const staged = WORKSPACES.filter((entry) => !entry.supported).map((entry) => entry.id);
  expect(supported).toEqual(["scene", "terrain", "assets", "materials", "ai"]);
  expect(staged).toEqual(["scripting", "animation", "audio", "lighting", "multiplayer"]);
});
