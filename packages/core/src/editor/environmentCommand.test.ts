import { expect, test } from "bun:test";

import { createEditorSession } from "./commands";
import { createEmptyEditorDocument } from "./document";
import type { EditorEnvironment } from "./types";

test("invalid environment dispatch preserves document, notifications, and redo history", () => {
  const session = createEditorSession(createEmptyEditorDocument());
  session.dispatch({ type: "setEnvironment", environment: { preset: "night" } });
  session.dispatch({ type: "undo" });
  const before = session.getState();
  let notifications = 0;
  session.subscribe(() => { notifications++; });
  for (const environment of [{ preset: "dawn" }, { sunIntensity: Infinity }, { fog: { far: "bad" } }]) {
    expect(() => session.dispatch({ type: "setEnvironment", environment: environment as EditorEnvironment })).toThrow("$.environment");
    expect(session.getState()).toBe(before);
    expect(session.canUndo()).toBe(false);
  }
  expect(notifications).toBe(0);
  session.dispatch({ type: "redo" });
  expect(session.getState().document.environment).toEqual({ preset: "night" });
});

test("environment dispatch decodes and owns nested input without validating unrelated legacy data", () => {
  const document = createEmptyEditorDocument();
  document.markers.push({ id: "legacy", kind: "prop", position: { x: "legacy" as unknown as number, y: 0, z: 0 } });
  const session = createEditorSession(document);
  const environment: EditorEnvironment = {
    preset: "day", horizonColor: "#d4cbb5", zenithColor: "#8196ae", sunIntensity: 1.55,
    ambientIntensity: 0.7, fog: { color: "#c4c7b6", near: 120, far: 370 },
    source: { kind: "cube", urls: ["a", "b", "c", "d", "e", "f"] },
    pointLights: [{ position: [1, 2, 3], intensity: 2 }],
  };
  session.dispatch({ type: "setEnvironment", environment });
  const stored = structuredClone(session.getState().document.environment);
  environment.fog!.far = 1;
  if (environment.source?.kind === "cube") environment.source.urls[0] = "mutated";
  environment.pointLights![0]!.position[0] = 99;
  expect(session.getState().document.environment).toEqual(stored);
  expect(session.getState().document.markers[0]!.position.x).toBe("legacy");
  session.dispatch({ type: "setEnvironment", environment: undefined });
  expect(session.getState().document).not.toHaveProperty("environment");
  session.dispatch({ type: "undo" });
  expect(session.getState().document.environment).toEqual(stored);
  session.dispatch({ type: "redo" });
  expect(session.getState().document).not.toHaveProperty("environment");
});
