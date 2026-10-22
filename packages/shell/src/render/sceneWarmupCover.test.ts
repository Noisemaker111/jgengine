import { describe, expect, test } from "bun:test";

import { SCENE_WARMUP_PENDING, SceneWarmupCover } from "./SceneWarmupGate";

function render(state: Parameters<typeof SceneWarmupCover>[0]["state"]): { markup: string; cover: Record<string, unknown> | null } {
  const element = SceneWarmupCover({ state });
  if (element === null) return { markup: "", cover: null };
  return {
    markup: typeof element.props.children === "string" ? element.props.children : "",
    cover: element.props as Record<string, unknown>,
  };
}

describe("SceneWarmupCover", () => {
  test("covers the canvas from the first frame until the warmup finishes", () => {
    const { markup, cover } = render(SCENE_WARMUP_PENDING);

    expect(cover).not.toBeNull();
    expect(cover?.["data-shell-code-loading"]).toBe(true);
    expect(cover?.["data-shell-warmup"]).toBe(true);
    expect(markup).toBe("Preparing scene.");
  });

  test("reports the shader count while compiling", () => {
    const { markup } = render({ phase: "compiling", rounds: 1, programs: 12, elapsedMs: 900 });
    expect(markup).toBe("Preparing scene (12 shaders)");
  });

  test("leaves the frame alone once warm or after a failed compile", () => {
    expect(render({ phase: "ready", rounds: 2, programs: 40, elapsedMs: 2_400 }).cover).toBeNull();
    expect(render({ phase: "failed", rounds: 0, programs: 0, elapsedMs: 30 }).cover).toBeNull();
  });
});
