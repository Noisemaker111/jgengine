import { describe, expect, test, beforeEach } from "bun:test";

import {
  clearHudPanelTypes,
  cloneEditorUiDocument,
  decodeEditorUiDocument,
  decodeUiPanelLayout,
  findUiPanel,
  getHudPanelType,
  listHudPanelTypes,
  patchUiPanel,
  placementFromUiPanel,
  registerHudPanelType,
  removeUiPanel,
  resizePanelSize,
  resolveHudPanelLayout,
  resolvePanelResize,
  uiPanelFromPlacement,
  type EditorUiDocument,
} from "./hudDocument";
import { createEditorSession } from "../editor/commands";
import { createEmptyEditorDocument } from "../editor/document";
import { anchoredPlacement, createHudLayout } from "./hudLayout";

describe("resolveHudPanelLayout", () => {
  test("uses TSX fallback when the document has no entry", () => {
    const resolved = resolveHudPanelLayout(undefined, {
      anchor: "top-right",
      inset: { x: 16, y: 24 },
      width: 200,
    });
    expect(resolved.fromDocument).toBe(false);
    expect(resolved.placement).toEqual({ anchor: "top-right", dx: -16, dy: 24 });
    expect(resolved.width).toBe(200);
    expect(resolved.visible).toBe(true);
  });

  test("document placement wins over TSX fallback", () => {
    const resolved = resolveHudPanelLayout(
      { anchor: "bottom-left", dx: 40, dy: -12, width: 320, visible: false, type: "health" },
      { anchor: "top-left", inset: { x: 8, y: 8 }, width: 100, type: "stats" },
    );
    expect(resolved.fromDocument).toBe(true);
    expect(resolved.placement).toEqual({ anchor: "bottom-left", dx: 40, dy: -12 });
    expect(resolved.width).toBe(320);
    expect(resolved.visible).toBe(false);
    expect(resolved.type).toBe("health");
  });

  test("document fills only authored fields; size falls back to TSX", () => {
    const resolved = resolveHudPanelLayout(
      { anchor: "center", dx: 0, dy: 0 },
      { anchor: "top", width: 180, height: 48 },
    );
    expect(resolved.width).toBe(180);
    expect(resolved.height).toBe(48);
  });
});

describe("patchUiPanel / removeUiPanel", () => {
  test("creates a ui section and panel on first patch", () => {
    const ui = patchUiPanel(undefined, "health", { anchor: "top-left", dx: 12, dy: 12 });
    expect(ui.panels.health).toEqual({ anchor: "top-left", dx: 12, dy: 12 });
  });

  test("merges a patch into an existing panel", () => {
    const base: EditorUiDocument = {
      panels: { health: { anchor: "top-left", dx: 8, dy: 8, width: 100 } },
    };
    const ui = patchUiPanel(base, "health", { dx: 40, width: 220 });
    expect(ui.panels.health).toEqual({ anchor: "top-left", dx: 40, dy: 8, width: 220 });
    expect(base.panels.health?.dx).toBe(8);
  });

  test("removeUiPanel drops a panel and clears empty ui", () => {
    const ui = patchUiPanel(undefined, "a", { anchor: "top", dx: 0, dy: 0 });
    expect(removeUiPanel(ui, "a")).toBeUndefined();
  });

  test("findUiPanel looks up by id", () => {
    const ui = patchUiPanel(undefined, "stats", { anchor: "right", dx: -16, dy: 0 });
    expect(findUiPanel(ui, "stats")?.anchor).toBe("right");
    expect(findUiPanel(ui, "missing")).toBeUndefined();
  });
});

describe("placement / ui panel conversion", () => {
  test("round-trips placement through ui panel", () => {
    const placement = { anchor: "bottom-right" as const, dx: -24, dy: -16 };
    const panel = uiPanelFromPlacement(placement, { width: 160, height: 40, type: "bar" });
    expect(placementFromUiPanel(panel)).toEqual(placement);
    expect(panel.width).toBe(160);
    expect(panel.type).toBe("bar");
  });
});

describe("resizePanelSize", () => {
  test("none axes leave size unchanged", () => {
    expect(resizePanelSize({ width: 100, height: 40 }, { dw: 50, dh: 20 }, "none")).toEqual({
      width: 100,
      height: 40,
    });
  });

  test("x axis grows width only and clamps to min/max", () => {
    expect(
      resizePanelSize({ width: 100, height: 40 }, { dw: 80, dh: 99 }, "x", {
        minWidth: 50,
        maxWidth: 150,
      }),
    ).toEqual({ width: 150, height: 40 });
  });

  test("y axis grows height only", () => {
    expect(resizePanelSize({ width: 100, height: 40 }, { dw: 80, dh: 20 }, "y")).toEqual({
      width: 100,
      height: 60,
    });
  });

  test("both axes grow width and height", () => {
    expect(resizePanelSize({ width: 100, height: 40 }, { dw: 10, dh: -5 }, "both")).toEqual({
      width: 110,
      height: 35,
    });
  });
});

describe("HudPanelType registry", () => {
  beforeEach(() => {
    clearHudPanelTypes();
  });

  test("register/list/get panel types with schema", () => {
    registerHudPanelType({
      id: "health-bar",
      label: "Health bar",
      resize: "x",
      minWidth: 80,
      maxWidth: 480,
      defaultWidth: 200,
      defaultHeight: 24,
      schema: {
        fields: [
          { type: "range", key: "trackLength", label: "Track", min: 80, max: 480, default: 200, unit: "px" },
          { type: "bool", key: "showLabel", default: true },
        ],
      },
    });
    expect(getHudPanelType("health-bar")?.resize).toBe("x");
    expect(listHudPanelTypes()).toHaveLength(1);
    expect(resolvePanelResize("health-bar")).toEqual({
      axes: "x",
      minWidth: 80,
      maxWidth: 480,
      minHeight: undefined,
      maxHeight: undefined,
    });
    expect(resolvePanelResize("unknown").axes).toBe("none");
  });
});

describe("decodeEditorUiDocument", () => {
  test("decodes a valid ui section and drops bad panels", () => {
    const ui = decodeEditorUiDocument({
      panels: {
        ok: { anchor: "top-left", dx: 1, dy: 2, width: 100, visible: true, type: "health" },
        badAnchor: { anchor: "nope", dx: 0, dy: 0 },
        badDx: { anchor: "center", dx: "x", dy: 0 },
      },
    });
    expect(ui?.panels.ok).toEqual({
      anchor: "top-left",
      dx: 1,
      dy: 2,
      width: 100,
      visible: true,
      type: "health",
    });
    expect(ui?.panels.badAnchor).toBeUndefined();
    expect(ui?.panels.badDx).toBeUndefined();
  });

  test("cloneEditorUiDocument is deep and independent", () => {
    const ui: EditorUiDocument = { panels: { a: { anchor: "top", dx: 0, dy: 1 } } };
    const cloned = cloneEditorUiDocument(ui)!;
    cloned.panels.a!.dx = 99;
    expect(ui.panels.a!.dx).toBe(0);
  });

  test("decodeUiPanelLayout rejects non-objects", () => {
    expect(decodeUiPanelLayout(null)).toBeNull();
    expect(decodeUiPanelLayout("x")).toBeNull();
  });
});

describe("layout store document resolve/patch path", () => {
  test("applyDocumentUi then toDocumentUi round-trips authored layout", () => {
    const layout = createHudLayout();
    layout.register("health", anchoredPlacement("top-left", { x: 8, y: 8 }), {
      width: 120,
      type: "health-bar",
    });
    layout.applyDocumentUi({
      panels: {
        health: { anchor: "bottom-right", dx: -20, dy: -16, width: 240, height: 28, type: "health-bar" },
      },
    });
    const panel = layout.getState().panels.health!;
    expect(panel.moved).toBe(true);
    expect(panel.placement).toEqual({ anchor: "bottom-right", dx: -20, dy: -16 });
    expect(panel.width).toBe(240);
    expect(panel.height).toBe(28);

    const docUi = layout.toDocumentUi();
    expect(docUi.panels.health).toEqual({
      anchor: "bottom-right",
      dx: -20,
      dy: -16,
      width: 240,
      height: 28,
      type: "health-bar",
    });
  });

  test("resize updates size and notifies document patch", () => {
    const patches: { id: string; width?: number; height?: number }[] = [];
    const layout = createHudLayout({
      onDocumentPatch: (id, panel) => {
        patches.push({ id, width: panel.width, height: panel.height });
      },
    });
    layout.register("list", anchoredPlacement("right", { x: 16, y: 0 }), { width: 200, height: 120 });
    layout.resize("list", { width: 280, height: 200 });
    expect(layout.getState().panels.list?.width).toBe(280);
    expect(layout.getState().panels.list?.height).toBe(200);
    expect(patches.at(-1)).toEqual({ id: "list", width: 280, height: 200 });
  });

  test("move patches document placement", () => {
    const patches: string[] = [];
    const layout = createHudLayout({
      onDocumentPatch: (id, panel) => {
        patches.push(`${id}:${panel.anchor}:${panel.dx}:${panel.dy}`);
      },
    });
    layout.register("toast", anchoredPlacement("top", { x: 0, y: 16 }));
    layout.move("toast", { x: 900, y: 10, width: 80, height: 30 }, { width: 1000, height: 600 });
    expect(layout.getState().panels.toast?.moved).toBe(true);
    expect(patches.length).toBe(1);
    expect(patches[0]!.startsWith("toast:")).toBe(true);
  });

  test("pending document ui applies on register", () => {
    const layout = createHudLayout();
    layout.applyDocumentUi({
      panels: { late: { anchor: "center", dx: 5, dy: -5, width: 50 } },
    });
    layout.register("late", anchoredPlacement("top-left", { x: 0, y: 0 }));
    const panel = layout.getState().panels.late!;
    expect(panel.placement).toEqual({ anchor: "center", dx: 5, dy: -5 });
    expect(panel.width).toBe(50);
    expect(panel.moved).toBe(true);
  });
});

describe("editor session setUiPanel is undoable", () => {
  test("setUiPanel / undo / redo preserve document ui", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({
      type: "setUiPanel",
      id: "health",
      patch: { anchor: "top-left", dx: 16, dy: 16, width: 200 },
    });
    expect(session.getState().document.ui?.panels.health?.width).toBe(200);

    session.dispatch({
      type: "setUiPanel",
      id: "health",
      patch: { width: 320, dx: 40 },
    });
    expect(session.getState().document.ui?.panels.health).toEqual({
      anchor: "top-left",
      dx: 40,
      dy: 16,
      width: 320,
    });

    session.dispatch({ type: "undo" });
    expect(session.getState().document.ui?.panels.health?.width).toBe(200);
    expect(session.getState().document.ui?.panels.health?.dx).toBe(16);

    session.dispatch({ type: "redo" });
    expect(session.getState().document.ui?.panels.health?.width).toBe(320);

    session.dispatch({ type: "removeUiPanel", id: "health" });
    expect(session.getState().document.ui).toBeUndefined();
  });

  test("canvas edits routed to setUiPanel write ui.panels and stay undoable", () => {
    // The exact seam the editor's HUD-layout mode relies on: a HudCanvas layout's onDocumentPatch
    // dispatches an undoable setUiPanel into the live editor session.
    const session = createEditorSession(createEmptyEditorDocument());
    const layout = createHudLayout({
      onDocumentPatch: (id, panel) => {
        session.dispatch({ type: "setUiPanel", id, patch: panel });
      },
    });
    layout.register("score", anchoredPlacement("top-left", { x: 16, y: 16 }), { width: 120 });
    expect(session.getState().document.ui).toBeUndefined();

    // Author drags the panel toward the bottom-right corner.
    layout.move("score", { x: 860, y: 540, width: 120, height: 40 }, { width: 1000, height: 600 });
    const written = session.getState().document.ui?.panels.score;
    expect(written).toBeDefined();
    expect(written).toEqual(layout.toDocumentUi().panels.score);
    expect(session.canUndo()).toBe(true);

    // Undo restores the pre-edit document (no ui section authored yet).
    session.dispatch({ type: "undo" });
    expect(session.getState().document.ui).toBeUndefined();

    session.dispatch({ type: "redo" });
    expect(session.getState().document.ui?.panels.score).toEqual(written);
  });
});
