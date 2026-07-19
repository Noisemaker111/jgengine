import { describe, expect, test } from "bun:test";

import { createEditorSession, createEmptyEditorDocument } from "@jgengine/core/editor/index";

import {
  animationMetaPatch,
  animationMode,
  defaultCustomConfig,
  readAnimationSetting,
  setAnimationMode,
  setLocomotionClip,
  setLocomotionNumber,
  setOneShotClip,
  type AnimationSetting,
} from "./modelAnimationAuthoring";

const CLIPS = ["Idle", "Walking_A", "Running_A", "1H_Melee_Attack_Slice", "Hit_A", "Death_A", "Jump"];

describe("readAnimationSetting / animationMode", () => {
  test("reads the string modes and a config object; ignores garbage", () => {
    expect(readAnimationSetting({ animation: "auto" })).toBe("auto");
    expect(readAnimationSetting({ animation: "none" })).toBe("none");
    expect(readAnimationSetting(undefined)).toBeUndefined();
    expect(readAnimationSetting({ animation: 42 })).toBeUndefined();
    const cfg = readAnimationSetting({
      animation: { states: { idle: "Idle", walk: "Walking_A", walkSpeed: 0.4 }, oneShots: { hit: "Hit_A" } },
    });
    expect(cfg).toEqual({ states: { idle: "Idle", walk: "Walking_A", walkSpeed: 0.4 }, oneShots: { hit: "Hit_A" } });
  });

  test("normalizes a one-shot array to its first variant when read back", () => {
    expect(readAnimationSetting({ animation: { oneShots: { attack: ["Slice", "Chop"] } } })).toEqual({
      oneShots: { attack: "Slice" },
    });
  });

  test("classifies mode", () => {
    expect(animationMode(undefined)).toBe("default");
    expect(animationMode("auto")).toBe("auto");
    expect(animationMode("none")).toBe("none");
    expect(animationMode({ states: { idle: "Idle" } })).toBe("custom");
  });
});

describe("authoring reducers", () => {
  test("defaultCustomConfig derives states + one-shots from clip roles", () => {
    expect(defaultCustomConfig(CLIPS)).toEqual({
      states: { idle: "Idle", walk: "Walking_A", run: "Running_A" },
      oneShots: { attack: "1H_Melee_Attack_Slice", hit: "Hit_A", death: "Death_A", jump: "Jump" },
    });
  });

  test("setAnimationMode maps modes and seeds custom from clips", () => {
    expect(setAnimationMode(undefined, "default")).toBeUndefined();
    expect(setAnimationMode(undefined, "auto")).toBe("auto");
    expect(setAnimationMode(undefined, "none")).toBe("none");
    expect(setAnimationMode("auto", "custom", CLIPS)).toEqual(defaultCustomConfig(CLIPS));
    // existing custom config is preserved when re-entering custom
    const existing: AnimationSetting = { states: { idle: "Idle", walk: "Idle" } };
    expect(setAnimationMode(existing, "custom", CLIPS)).toBe(existing);
  });

  test("locomotion clip + number set and clear", () => {
    let cfg = setLocomotionClip("auto", "idle", "Idle");
    cfg = setLocomotionClip(cfg, "walk", "Walking_A");
    cfg = setLocomotionClip(cfg, "run", "Running_A");
    expect(cfg.states).toEqual({ idle: "Idle", walk: "Walking_A", run: "Running_A" });
    cfg = setLocomotionClip(cfg, "run", null);
    expect(cfg.states).toEqual({ idle: "Idle", walk: "Walking_A" });
    cfg = setLocomotionNumber(cfg, "walkSpeed", 0.6);
    expect(cfg.states?.walkSpeed).toBe(0.6);
    cfg = setLocomotionNumber(cfg, "walkSpeed", null);
    expect(cfg.states?.walkSpeed).toBeUndefined();
  });

  test("one-shot bind and clear; drops the map when empty", () => {
    let cfg = setOneShotClip(undefined, "hit", "Hit_A");
    expect(cfg.oneShots).toEqual({ hit: "Hit_A" });
    cfg = setOneShotClip(cfg, "hit", null);
    expect(cfg.oneShots).toBeUndefined();
  });
});

describe("document round-trip (undo/redo safe)", () => {
  function seededSession() {
    const doc = createEmptyEditorDocument();
    const session = createEditorSession(doc);
    session.dispatch({
      type: "addMarker",
      marker: { id: "hero", kind: "prop", position: { x: 0, y: 0, z: 0 }, catalogId: "kaykit:skeleton" },
    });
    return session;
  }

  function markerMeta(session: ReturnType<typeof seededSession>) {
    return session.getState().document.markers.find((m) => m.id === "hero")?.meta;
  }

  test("authored animation persists through setMarker and survives undo/redo", () => {
    const session = seededSession();
    const marker = session.getState().document.markers[0]!;

    let setting = setLocomotionClip(readAnimationSetting(marker.meta), "idle", "Idle");
    setting = setLocomotionClip(setting, "walk", "Walking_A");
    setting = setOneShotClip(setting, "death", "Death_A");

    session.dispatch({
      type: "setMarker",
      id: "hero",
      patch: { meta: { ...marker.meta, ...animationMetaPatch(setting) } },
    });

    // Persisted, and re-reads to the same authored setting.
    expect(markerMeta(session)?.["animation"]).toEqual({
      states: { idle: "Idle", walk: "Walking_A" },
      oneShots: { death: "Death_A" },
    });
    expect(readAnimationSetting(markerMeta(session))).toEqual(setting);

    // Undo reverts to no override; redo restores it.
    session.dispatch({ type: "undo" });
    expect(readAnimationSetting(markerMeta(session))).toBeUndefined();
    session.dispatch({ type: "redo" });
    expect(readAnimationSetting(markerMeta(session))).toEqual(setting);
  });

  test("switching to auto then default clears the override", () => {
    const session = seededSession();
    const withAuto = setAnimationMode(readAnimationSetting(markerMeta(session)), "auto");
    session.dispatch({
      type: "setMarker",
      id: "hero",
      patch: { meta: { ...markerMeta(session), ...animationMetaPatch(withAuto) } },
    });
    expect(markerMeta(session)?.["animation"]).toBe("auto");

    const cleared = setAnimationMode(readAnimationSetting(markerMeta(session)), "default");
    session.dispatch({
      type: "setMarker",
      id: "hero",
      patch: { meta: { ...markerMeta(session), ...animationMetaPatch(cleared) } },
    });
    // Override key drops to undefined (removed from the saved JSON document).
    expect(readAnimationSetting(markerMeta(session))).toBeUndefined();
  });
});
