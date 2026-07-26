import { describe, expect, mock, test } from "bun:test";
import { Suspense, type ReactNode } from "react";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import {
  armFallbackSeams,
  beginFallbackPass,
  fallbackSeamsSnapshot,
} from "@jgengine/core/devtools/fallbackSeams";

import { IsolatedModelPart, ModelFallbackBoundary } from "./SceneModels";

// The shell has no React renderer in test (no react-dom / test-renderer), so the boundary is
// exercised through the same lifecycle React drives: construct, apply getDerivedStateFromError,
// render. That is enough to pin the two guarantees that matter — a failure is reported, and it is
// scoped to its own boundary.
function mount(props: { fallback: ReactNode; children: ReactNode; url: string; seam?: "entity" | "object" }) {
  const instance = new ModelFallbackBoundary(props);
  return {
    render: () => instance.render(),
    fail: (error: unknown) => {
      instance.state = ModelFallbackBoundary.getDerivedStateFromError();
      instance.componentDidCatch(error);
    },
  };
}

const MODEL: ModelConfig = { url: "/models/robot-torso.glb" };

describe("ModelFallbackBoundary", () => {
  test("renders children while healthy and reports nothing", () => {
    armFallbackSeams(true);
    beginFallbackPass();
    const boundary = mount({ fallback: "fallback", children: "children", url: MODEL.url });
    expect(boundary.render()).toBe("children");
    expect(fallbackSeamsSnapshot()).toEqual({});
    armFallbackSeams(false);
  });

  test("a caught throw reports the entity seam and keeps reporting while failed", () => {
    armFallbackSeams(true);
    beginFallbackPass();
    const warn = mock(() => {});
    const original = console.warn;
    console.warn = warn;
    const boundary = mount({ fallback: null, children: "children", url: MODEL.url });
    boundary.fail(new Error("texture 404"));
    console.warn = original;

    expect(boundary.render()).toBeNull();
    expect(fallbackSeamsSnapshot()).toEqual({ entity: { renderError: 1 } });
    // Re-rendering a still-failed boundary re-reports, so the per-seam frame boundary in WorldScene
    // cannot zero the failure out from under it.
    boundary.render();
    expect(fallbackSeamsSnapshot()).toEqual({ entity: { renderError: 2 } });

    expect(warn).toHaveBeenCalledTimes(1);
    const [message, error] = warn.mock.calls[0] as unknown as [string, Error];
    expect(message).toContain(MODEL.url);
    expect(error).toBeInstanceOf(Error);
    armFallbackSeams(false);
  });

  test("an object-seam model reports as an object, not an entity", () => {
    armFallbackSeams(true);
    beginFallbackPass();
    const boundary = mount({ fallback: null, children: "children", url: MODEL.url, seam: "object" });
    const original = console.warn;
    console.warn = mock(() => {});
    boundary.fail(new Error("boom"));
    console.warn = original;
    boundary.render();
    expect(fallbackSeamsSnapshot()).toEqual({ object: { renderError: 1 } });
    armFallbackSeams(false);
  });

  test("a failed part does not erase its siblings or the base mesh", () => {
    armFallbackSeams(true);
    beginFallbackPass();
    const base = mount({ fallback: null, children: "torso", url: MODEL.url });
    const parts = ["leg.l", "leg.r", "head"].map((role) =>
      mount({ fallback: null, children: role, url: `/models/${role}.glb` }),
    );
    const original = console.warn;
    console.warn = mock(() => {});
    parts[1]!.fail(new Error("part exploded"));
    console.warn = original;

    expect(base.render()).toBe("torso");
    expect(parts.map((part) => part.render())).toEqual(["leg.l", null, "head"]);
    expect(fallbackSeamsSnapshot()).toEqual({ entity: { renderError: 1 } });
    armFallbackSeams(false);
  });

  test("reporting stays a no-op when the probe is disarmed", () => {
    armFallbackSeams(false);
    const boundary = mount({ fallback: null, children: "children", url: MODEL.url });
    const original = console.warn;
    console.warn = mock(() => {});
    boundary.fail(new Error("boom"));
    console.warn = original;
    boundary.render();
    expect(fallbackSeamsSnapshot()).toEqual({});
  });
});

describe("IsolatedModelPart", () => {
  test("wraps each part in its own error boundary and Suspense boundary", () => {
    const element = IsolatedModelPart({ model: MODEL, children: "part" }) as {
      type: unknown;
      props: { url: string; fallback: ReactNode; children: { type: unknown; props: { fallback: ReactNode } } };
    };
    expect(element.type).toBe(ModelFallbackBoundary);
    expect(element.props.url).toBe(MODEL.url);
    expect(element.props.fallback).toBeNull();
    expect(element.props.children.type).toBe(Suspense);
    expect(element.props.children.props.fallback).toBeNull();
  });
});
