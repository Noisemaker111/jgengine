import { describe, expect, test } from "bun:test";

import { SCENE_WARMUP_PENDING, SceneWarmupCover, createSceneWarmupStore, warmupBarShare } from "./SceneWarmupGate";

function textOf(node: unknown): string {
  if (node === null || node === undefined || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  const children = (node as { props?: { children?: unknown } }).props?.children;
  return children === undefined ? "" : textOf(children);
}

function render(state: Parameters<typeof SceneWarmupCover>[0]["state"]) {
  const element = SceneWarmupCover({ state });
  if (element === null) return { markup: "", cover: null };
  return { markup: textOf(element.props.children), cover: element.props as Record<string, unknown> };
}

describe("SceneWarmupCover", () => {
  test("covers the canvas from the first frame until the warmup finishes", () => {
    const { markup, cover } = render(SCENE_WARMUP_PENDING);

    expect(cover).not.toBeNull();
    expect(cover?.["data-shell-code-loading"]).toBe(true);
    expect(cover?.["data-shell-warmup"]).toBe(true);
    expect(markup).toContain("Preparing scene.");
  });

  test("reports the shader count while compiling", () => {
    const { markup } = render({ phase: "compiling", rounds: 0, programs: 12, planned: 40, deferred: 0, progress: 0.3, elapsedMs: 900 });
    expect(markup).toContain("Preparing scene (12 shaders)");
  });

  test("names the work left for the background instead of hiding it", () => {
    const { markup } = render({ phase: "compiling", rounds: 1, programs: 20, planned: 40, deferred: 60, progress: 0.5, elapsedMs: 1_400 });
    expect(markup).toContain("60 more prepare after this");
    expect(markup).toContain("1.4s");
  });

  test("leaves the frame alone once warm or after a failed compile", () => {
    expect(render({ phase: "ready", rounds: 2, programs: 40, planned: 40, deferred: 0, progress: 0.3, elapsedMs: 2_400 }).cover).toBeNull();
    expect(render({ phase: "failed", rounds: 0, programs: 0, planned: 0, deferred: 0, progress: 0.3, elapsedMs: 30 }).cover).toBeNull();
  });

  test("the bar fills with the share of links the GPU has run, never empty while covered", () => {
    expect(warmupBarShare(SCENE_WARMUP_PENDING)).toBe(0.05);
    expect(warmupBarShare({ phase: "compiling", rounds: 0, programs: 12, planned: 40, deferred: 0, progress: 0.5, elapsedMs: 900 })).toBe(0.5);
    expect(warmupBarShare({ phase: "compiling", rounds: 0, programs: 0, planned: 40, deferred: 0, progress: 0, elapsedMs: 10 })).toBe(0.05);
  });
});

describe("createSceneWarmupStore", () => {
  test("hands progress to the cover's subscription, not to the component that renders the canvas", () => {
    const store = createSceneWarmupStore();
    expect(store.get()).toBe(SCENE_WARMUP_PENDING);
    let heard = 0;
    const stop = store.subscribe(() => {
      heard += 1;
    });
    const compiling = { ...SCENE_WARMUP_PENDING, phase: "compiling" as const, progress: 0.5 };
    store.set(compiling);
    expect(store.get()).toBe(compiling);
    expect(heard).toBe(1);
    stop();
    store.set(SCENE_WARMUP_PENDING);
    expect(heard).toBe(1);
  });
});
