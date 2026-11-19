import { describe, expect, test } from "bun:test";
import { pruneFileComments } from "./prune-comments";

describe("pruneFileComments", () => {
  test("keeps why, lifecycle, capture, ownership, unit, range, and default comments while dropping pure narration", () => {
    const src = [
      "/** @jsxImportSource @jgengine/core/ui/jsx */",
      "// @skill jgengine-world",
      "/** A running attack clock. */",
      "export interface Clock {",
      "  /** Camera fov/zoom and near/far planes. */",
      "  camera?: { fov?: number };",
      "  /** Keep the drawing buffer for capture/snapshot reads. */",
      "  preserveDrawingBuffer?: boolean;",
      "  /** Pixel ratio, or [min, max] clamped against devicePixelRatio. */",
      "  dpr?: number | readonly [number, number];",
      "  /** Radius in metres; defaults to 5. */",
      "  radius?: number;",
      "}",
      "/**",
      " * Run task right after render.",
      " * Used by canvas readers that need the frame the renderer just drew before the drawing buffer is cleared.",
      " */",
      "export function joinAfterRenderTask() {}",
      "/**",
      " * Children remount when the renderer backend changes so draws never survive a dead scene.",
      " */",
      "export function EngineCanvas() {}",
      "/**",
      " * Build a widget.",
      " * @capability widget-maker create a widget",
      " */",
      "export function createWidget() {}",
      "// --- Helpers ---",
      "// const old = 1;",
      "export const ok = 1;",
    ].join("\n") + "\n";

    const { next } = pruneFileComments("example.tsx", src);
    expect(next).toContain("@jsxImportSource");
    expect(next).toContain("// @skill jgengine-world");
    expect(next).toContain("Keep the drawing buffer for capture/snapshot reads.");
    expect(next).toContain("clamped against devicePixelRatio");
    expect(next).toContain("Radius in metres; defaults to 5.");
    expect(next).toContain("before the drawing buffer is cleared");
    expect(next).toContain("so draws never survive a dead scene");
    expect(next).toContain("/** @capability widget-maker create a widget */");

    expect(next).not.toContain("A running attack clock.");
    expect(next).not.toContain("Camera fov/zoom and near/far planes.");
    expect(next).not.toContain("Build a widget.");
    expect(next).not.toContain("--- Helpers ---");
    expect(next).not.toContain("// const old = 1;");
  });
});
