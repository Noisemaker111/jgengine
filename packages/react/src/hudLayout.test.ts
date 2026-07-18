import { describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { anchoredPlacement, type HudLayoutStore } from "@jgengine/core/ui/hudLayout";
import type { EditorUiPanelLayout } from "@jgengine/core/ui/hudDocument";

import { hudVisibleInPhase, useHudLayout } from "./hudLayout";
import { HudLayoutPersistProvider } from "./hudLayoutPersist";

describe("hudVisibleInPhase", () => {
  test("undefined showDuring is always visible", () => {
    expect(hudVisibleInPhase(undefined, "menu")).toBe(true);
    expect(hudVisibleInPhase(undefined, "playing")).toBe(true);
    expect(hudVisibleInPhase(undefined, "ended")).toBe(true);
  });

  test("visible only in listed phases", () => {
    expect(hudVisibleInPhase(["playing"], "playing")).toBe(true);
    expect(hudVisibleInPhase(["playing"], "menu")).toBe(false);
    expect(hudVisibleInPhase(["playing"], "ended")).toBe(false);
  });

  test("multiple phases", () => {
    expect(hudVisibleInPhase(["playing", "paused"], "paused")).toBe(true);
    expect(hudVisibleInPhase(["playing", "paused"], "menu")).toBe(false);
  });

  test("empty list hides everywhere", () => {
    expect(hudVisibleInPhase([], "playing")).toBe(false);
  });
});

function CaptureLayout({
  onLayout,
  documentPatches,
}: {
  onLayout: (layout: HudLayoutStore) => void;
  documentPatches?: boolean;
}): null {
  const layout = useHudLayout({ documentPatches });
  onLayout(layout);
  return null;
}

function renderLayout(
  onLayout: (layout: HudLayoutStore) => void,
  wrap?: (child: ReactNode) => ReactNode,
  documentPatches?: boolean,
): void {
  const tree = createElement(CaptureLayout, { onLayout, documentPatches });
  renderToStaticMarkup(createElement("div", null, wrap ? wrap(tree) : tree));
}

describe("useHudLayout document patches", () => {
  test("no-ops when no HudLayoutPersistProvider is mounted", () => {
    let layout: HudLayoutStore | undefined;
    renderLayout((next) => {
      layout = next;
    });
    expect(layout).toBeDefined();
    layout!.register("score", anchoredPlacement("top-left", { x: 16, y: 16 }), { width: 120 });
    // Without a host port, move must not throw.
    layout!.move("score", { x: 100, y: 80, width: 120, height: 40 }, { width: 1000, height: 600 });
    expect(layout!.getState().panels.score?.moved).toBe(true);
  });

  test("invokes injected onPanelCommit on canvas move", () => {
    const commits: { id: string; panel: EditorUiPanelLayout }[] = [];
    let layout: HudLayoutStore | undefined;
    renderLayout(
      (next) => {
        layout = next;
      },
      (child) =>
        createElement(
          HudLayoutPersistProvider,
          {
            onPanelCommit: (id, panel) => {
              commits.push({ id, panel });
            },
          },
          child,
        ),
    );
    expect(layout).toBeDefined();
    layout!.register("score", anchoredPlacement("top-left", { x: 16, y: 16 }), { width: 120 });
    layout!.move("score", { x: 860, y: 540, width: 120, height: 40 }, { width: 1000, height: 600 });
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.at(-1)?.id).toBe("score");
    expect(commits.at(-1)?.panel).toEqual(layout!.toDocumentUi().panels.score);
  });

  test("documentPatches:false never calls the persist port", () => {
    const commits: { id: string; panel: EditorUiPanelLayout }[] = [];
    let layout: HudLayoutStore | undefined;
    renderLayout(
      (next) => {
        layout = next;
      },
      (child) =>
        createElement(
          HudLayoutPersistProvider,
          {
            onPanelCommit: (id, panel) => {
              commits.push({ id, panel });
            },
          },
          child,
        ),
      false,
    );
    layout!.register("score", anchoredPlacement("top-left", { x: 16, y: 16 }), { width: 120 });
    layout!.move("score", { x: 100, y: 80, width: 120, height: 40 }, { width: 1000, height: 600 });
    expect(commits).toEqual([]);
  });
});
