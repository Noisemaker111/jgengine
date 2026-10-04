import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameProvider } from "@jgengine/react/provider";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import { createEditorSession, createEmptyEditorDocument } from "@jgengine/core/editor/index";
import { markerAnimation, placeAuthoredObjectsFromDocument } from "@jgengine/core/world/authoredObjects";
import { animGraphFromConfig } from "@jgengine/core/anim/locomotionGraph";
import { createAnimGraphRuntime } from "@jgengine/core/anim/animGraph";
import { diagnoseModelAnimation } from "@jgengine/shell/render/useModelAnimation";

import { createEditorHost } from "./session";
import { createEditorUiStore } from "./uiStore";
import { InspectorPanel } from "./InspectorPanel";
import { AnimationGraphPanel } from "./shell/AnimationGraphPanel";

import {
  animationMetaPatch,
  animationMode,
  clearAnimGraph,
  effectiveAnimGraph,
  setTransitionDuration,
  storeAnimGraph,
  defaultCustomConfig,
  readAnimationSetting,
  readAnimationSettingResult,
  setAnimationMode,
  setLocomotionClip,
  setLocomotionNumber,
  setOneShotClip,
  setPlaybackBoolean,
  setPlaybackClip,
  setPlaybackNumber,
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

  test("preserves one-shot variants when read back", () => {
    expect(readAnimationSetting({ animation: { oneShots: { attack: ["Slice", "Chop"] } } })).toEqual({
      oneShots: { attack: ["Slice", "Chop"] },
    });
  });

  test("an unrelated inspector edit preserves held-pose playback", () => {
    const stored = { clip: "Idle", paused: true, time: 0.75, timeScale: 0.5, loop: false };
    const edited = setOneShotClip(readAnimationSetting({ animation: stored }), "hit", "Hit_A");
    expect(edited).toEqual({ ...stored, oneShots: { hit: "Hit_A" } });
  });

  test("empty locomotion intent survives reading and clearing the last role", () => {
    expect(readAnimationSetting({ animation: { states: {} } })).toEqual({ states: {} });
    expect(setLocomotionClip({ states: { idle: "Idle" } }, "idle", null)).toEqual({ states: {} });
    expect(setLocomotionNumber({ states: { fadeSec: 0.2 } }, "fadeSec", null)).toEqual({ states: {} });
    expect(setPlaybackClip({ states: {} }, "Idle")).toEqual({ clip: "Idle" });
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

  test("entering custom from auto retains the asset's one-shot identities", () => {
    const config = setAnimationMode("auto", "custom", [...CLIPS, "Hit_B"]);
    expect(typeof config === "object" ? config.oneShots?.hit : undefined).toEqual(["Hit_A", "Hit_B"]);
  });

  test("the first locomotion edit after single-clip playback seeds actual rig roles", () => {
    const held = { ...setPlaybackClip(undefined, "Idle"), paused: true, time: 0.75, oneShots: { attack: ["Slice", "Chop"] } };
    const edited = setLocomotionClip(held, "run", "Running_A", CLIPS);
    expect(edited).toEqual({ ...held, states: { idle: "Idle", walk: "Walking_A", run: "Running_A" } });
    const runtime = animGraphFromConfig(edited);
    expect(effectiveAnimGraph(edited, CLIPS)?.graph).toEqual(runtime);
    expect(setLocomotionNumber(held, "runSpeed", 8, CLIPS).states).toEqual({ idle: "Idle", walk: "Walking_A", run: "Running_A", runSpeed: 8 });
  });

  test("first locomotion edits never invent roles for an unsupported rig", () => {
    const held = setPlaybackClip(undefined, "Wave");
    const edited = setLocomotionClip(held, "run", "Sprint", ["Wave", "Sprint"]);
    expect(edited).toEqual({ clip: "Wave", states: { run: "Sprint" } });
    expect(effectiveAnimGraph(edited, ["Wave", "Sprint"])).toBeNull();
    expect(setLocomotionClip(held, "run", null, CLIPS)).toEqual(held);
    expect(setLocomotionNumber(held, "runSpeed", null, CLIPS)).toEqual(held);
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

  test("playback adjustments preserve variants; replacing the playback source is explicit", () => {
    const graph = effectiveAnimGraph("auto", CLIPS)!.graph;
    const original: AnimationSetting = { states: { idle: "Idle" }, graph, oneShots: { attack: ["Slice", "Chop"] } };
    const held = setPlaybackNumber(setPlaybackBoolean(original, "paused", true), "time", 0.75);
    expect(held.graph).toBe(graph);
    expect(held.states).toEqual(original.states);
    expect(held.oneShots).toEqual(original.oneShots);
    expect(setPlaybackClip(held, "Idle")).toEqual({ clip: "Idle", paused: true, time: 0.75, oneShots: original.oneShots });
    expect(setPlaybackNumber(held, "time", -1).time).toBe(0);
    expect(setPlaybackNumber(held, "time", null).time).toBeUndefined();
    expect(setPlaybackNumber(held, "timeScale", Number.NaN).timeScale).toBeUndefined();
    expect(setOneShotClip(held, "attack", ["Chop", "Slice"]).oneShots?.attack).toEqual(["Chop", "Slice"]);
    expect(setOneShotClip(held, "attack", ["Chop"]).oneShots?.attack).toBe("Chop");
    expect(setOneShotClip(held, "attack", []).oneShots).toBeUndefined();
  });

  test("non-finite playback and malformed variants reject the whole override on read", () => {
    expect(readAnimationSetting({ animation: { time: Infinity, timeScale: NaN, states: { idle: "Idle", walkSpeed: NaN }, oneShots: { hit: ["Hit_A", 3], attack: [] } } })).toBeUndefined();
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

  test("RPC placement, inspector adjustment, undo/redo and document reload preserve the runtime override", () => {
    const host = createEditorHost({ gameId: "character-proof", layers: {} });
    expect(host.api.handle({ method: "add_marker", id: "hero", kind: "prop", catalogId: "knight", x: 2, y: 0, z: 3 }).ok).toBe(true);
    const original = { clip: "Idle", paused: true, time: 0.75, timeScale: 0.5, loop: false, oneShots: { attack: ["Slice", "Chop"] } };
    expect(host.api.handle({ method: "set_meta", id: "hero", patch: animationMetaPatch(original) }).ok).toBe(true);
    expect(host.api.handle({ method: "set_mode", mode: "play" }).ok).toBe(true);
    expect(host.api.handle({ method: "set_mode", mode: "edit" }).ok).toBe(true);
    const session = host.api.getSession();
    const marker = () => session.getState().document.markers.find((entry) => entry.id === "hero")!;
    const adjusted = setPlaybackNumber(readAnimationSetting(marker().meta), "timeScale", 0.8);
    session.dispatch({ type: "setMarker", id: "hero", patch: { meta: { ...marker().meta, ...animationMetaPatch(adjusted) } } });
    expect(markerAnimation(marker())).toEqual({ ...original, timeScale: 0.8 });
    session.dispatch({ type: "undo" });
    expect(markerAnimation(marker())).toEqual(original);
    session.dispatch({ type: "redo" });
    const exported = host.api.handle({ method: "export_document" });
    expect(exported.ok).toBe(true);
    const json = (exported.result as { json: string }).json;
    const reopened = createEditorHost({ gameId: "character-proof", layers: {} });
    expect(reopened.api.handle({ method: "import_document", json }).ok).toBe(true);
    const document = reopened.api.getSession().getState().document;
    expect(readAnimationSetting(document.markers[0]!.meta)).toEqual(adjusted);
    const placed: unknown[] = [];
    placeAuthoredObjectsFromDocument({ place: (...args) => { placed.push(args); return args[4]!.instanceId!; } }, document, () => 0);
    expect(placed).toEqual([["knight", 2, 0, 3, { instanceId: "hero", rotation: 0, animation: { ...original, timeScale: 0.8 } }]]);
    host.dispose();
    reopened.dispose();
  });

  test("a real Knight's first locomotion edit survives saved reload and plays valid imported clips", async () => {
    const bytes = readFileSync(new URL("../../../apps/dev/public/models/kaykit-adventurers/Knight.glb", import.meta.url));
    const imported = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const clips = imported.animations.map((clip) => clip.name);
    const host = createEditorHost({ gameId: "character-proof", layers: {} });
    expect(host.api.handle({ method: "add_marker", id: "hero", kind: "prop", catalogId: "knight", x: 0, z: 0 }).ok).toBe(true);
    expect(host.api.handle({ method: "set_meta", id: "hero", patch: animationMetaPatch(setPlaybackClip(undefined, "Idle")) }).ok).toBe(true);
    const marker = host.api.getSession().getState().document.markers[0]!;
    const edited = setLocomotionClip(readAnimationSetting(marker.meta), "run", "Running_A", clips);
    host.api.getSession().dispatch({ type: "setMarker", id: "hero", patch: { meta: { ...marker.meta, ...animationMetaPatch(edited) } } });
    const exported = host.api.handle({ method: "export_document" });
    const reopened = createEditorHost({ gameId: "character-proof", layers: {} });
    expect(reopened.api.handle({ method: "import_document", json: (exported.result as { json: string }).json }).ok).toBe(true);
    const restored = markerAnimation(reopened.api.getSession().getState().document.markers[0]!);
    expect(restored).toEqual(edited);
    if (typeof restored !== "object") throw new Error("expected an authored config");
    const graph = animGraphFromConfig(restored);
    expect(graph).toEqual(effectiveAnimGraph(readAnimationSetting({ animation: restored }), clips)?.graph);
    if (graph === undefined) throw new Error("expected the edited locomotion graph");
    const output = createAnimGraphRuntime(graph).advance(0.25, { speed: 2 }, Object.fromEntries(imported.animations.map((clip) => [clip.name, clip.duration])));
    expect(output.clips.some((clip) => clip.clip === "Walking_A" && clip.weight > 0)).toBe(true);
    expect(output.clips.every((clip) => clips.includes(clip.clip) && Number.isFinite(clip.time) && Number.isFinite(clip.weight))).toBe(true);
    host.dispose();
    reopened.dispose();
  });

  test("empty Knight locomotion stays pending after a playback edit and saved reload", async () => {
    const bytes = readFileSync(new URL("../../../apps/dev/public/models/kaykit-adventurers/Knight.glb", import.meta.url));
    const imported = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const host = createEditorHost({ gameId: "empty-locomotion-proof", layers: {} });
    const reopened = createEditorHost({ gameId: "empty-locomotion-proof", layers: {} });
    try {
      expect(imported.animations.length).toBeGreaterThan(0);
      expect(host.api.handle({ method: "add_marker", id: "hero", kind: "prop", catalogId: "knight", x: 0, z: 0 }).ok).toBe(true);
      expect(host.api.handle({ method: "set_meta", id: "hero", patch: { animation: { states: {} } } }).ok).toBe(true);
      const marker = host.api.getSession().getState().document.markers[0]!;
      const edited = setPlaybackNumber(readAnimationSetting(marker.meta), "timeScale", 0.8);
      expect(edited).toEqual({ states: {}, timeScale: 0.8 });
      host.api.getSession().dispatch({ type: "setMarker", id: "hero", patch: { meta: { ...marker.meta, ...animationMetaPatch(edited) } } });
      const exported = host.api.handle({ method: "export_document" });
      expect(reopened.api.handle({ method: "import_document", json: (exported.result as { json: string }).json }).ok).toBe(true);
      const restored = markerAnimation(reopened.api.getSession().getState().document.markers[0]!);
      expect(restored).toEqual(edited);
      if (typeof restored !== "object") throw new Error("expected an authored config");
      expect(animGraphFromConfig(restored)).toBeUndefined();
      expect(effectiveAnimGraph(readAnimationSetting({ animation: restored }), imported.animations.map((clip) => clip.name))).toBeNull();
      expect(diagnoseModelAnimation(imported.scene, restored, imported.animations)).toContainEqual({ code: "incomplete-locomotion", message: "locomotion needs a nonempty idle clip. Configure this rig's idle role; the bind pose is retained until then." });
      expect(setPlaybackClip(readAnimationSetting({ animation: restored }), "Idle")).toEqual({ clip: "Idle", timeScale: 0.8 });
    } finally {
      host.dispose();
      reopened.dispose();
    }
  });
});

describe("animation graph authoring", () => {
  const clips = ["Idle", "Walking_A", "Running_A", "Hit_A", "Death_A", "1H_Melee_Attack_Chop"];

  test("the effective graph follows the stored setting", () => {
    expect(effectiveAnimGraph(undefined, clips)?.source).toBe("auto");
    expect(effectiveAnimGraph("auto", clips)?.graph.layers[0]!.states.death).toEqual({ kind: "clip", clip: "Death_A", loop: false });
    expect(effectiveAnimGraph("none", clips)).toBeNull();
    const custom = effectiveAnimGraph({ states: { idle: "Idle", walk: "Walking_A" }, oneShots: { cheer: "Cheer" } }, clips);
    expect(custom?.source).toBe("locomotion");
    expect(Object.keys(custom!.graph.layers[0]!.states)).toEqual(["locomotion", "cheer"]);
    expect(effectiveAnimGraph({ clip: "Idle" }, clips)).toBeNull();
  });

  test("partial persisted roles have consistent editor and runtime graph policies", () => {
    expect(effectiveAnimGraph({ clip: "Idle", states: { run: "Running_A" } }, clips)).toBeNull();
    expect(effectiveAnimGraph({ states: { idle: "", walk: "Walking_A" } }, clips)).toBeNull();
    expect(effectiveAnimGraph({ states: { idle: "   ", walk: "Walking_A" } }, clips)).toBeNull();
    const heldWalk = effectiveAnimGraph({ states: { idle: "Idle", walk: "" } }, clips)?.graph;
    expect(heldWalk?.layers[0]!.states.locomotion).toEqual({ kind: "blend1D", param: "speed", points: [{ at: 0, clip: "Idle" }, { at: 0.5, clip: "Idle" }] });
  });

  test("editing a transition stores the graph, which survives a meta round trip", () => {
    const derived = effectiveAnimGraph("auto", clips)!.graph;
    const stored = setTransitionDuration("auto", derived, "base", 0, 0.35);
    expect(stored.graph!.layers[0]!.transitions[0]!.duration).toBe(0.35);
    const reread = readAnimationSetting(JSON.parse(JSON.stringify(animationMetaPatch(stored))));
    expect(reread).toEqual(stored);
    expect(effectiveAnimGraph(reread, clips)?.source).toBe("authored");
  });

  test("clearing the graph falls back to states, or to no override", () => {
    const graph = effectiveAnimGraph("auto", clips)!.graph;
    expect(clearAnimGraph(storeAnimGraph({ states: { idle: "Idle" } }, graph))).toEqual({ states: { idle: "Idle" } });
    expect(clearAnimGraph(storeAnimGraph(undefined, graph))).toBeUndefined();
    expect(clearAnimGraph("auto")).toBe("auto");
  });
});


describe("saved animation integrity", () => {
  test("a malformed authored combat graph is rejected without silently deleting its transition", () => {
    const graph = effectiveAnimGraph("auto", CLIPS)!.graph;
    const corrupt = structuredClone(graph);
    const transition = corrupt.layers[0]!.transitions.find((entry) => entry.to === "death")!;
    transition.to = "missing-state";
    const before = structuredClone(corrupt);
    expect(readAnimationSetting({ animation: { graph: corrupt } })).toBeUndefined();
    expect(corrupt).toEqual(before);
  });

  test("an unrelated Hold edit retains valid extension fields and deliberate empty variant arrays", () => {
    const graph = { ...effectiveAnimGraph("auto", CLIPS)!.graph, identity: { author: "combat mapping" } };
    const animation = { graph, timeScale: -0.5, time: -1, states: {}, oneShots: { attack: [] }, identity: { rig: "Knight" } };
    const read = readAnimationSetting({ animation });
    expect(read).toEqual(animation);
    expect(setPlaybackBoolean(read, "paused", true)).toEqual({ ...animation, paused: true });
  });
});


test("both real editor panels expose a located saved error and retain it until an undoable replacement", () => {
  const document = createEmptyEditorDocument();
  const graph = structuredClone(effectiveAnimGraph("auto", CLIPS)!.graph);
  const index = graph.layers[0]!.transitions.findIndex((transition) => transition.to === "death");
  graph.layers[0]!.transitions[index]!.to = "missing-state";
  document.markers = [{ id: "hero", kind: "player_spawn", catalogId: "knight", position: { x: 0, y: 0, z: 0 }, meta: { animation: { graph }, routeId: "keep-me" } }];
  const session = createEditorSession(document);
  session.dispatch({ type: "select", ids: ["hero"] });
  const ui = createEditorUiStore();
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "editor-animation-diagnostics", assets: createAssetCatalog(), multiplayer: "off" }), content: {}, player: { userId: "player", isNew: true } });
  const asset = { id: "knight", label: "Knight", url: "/Knight.glb", clips: CLIPS };
  const inspector = () => renderToStaticMarkup(createElement(GameProvider, { context: ctx }, createElement(InspectorPanel, { session, ui, assets: [asset] })));
  const panel = () => renderToStaticMarkup(createElement(AnimationGraphPanel, { session, ui, rigged: [asset] }));
  const result = readAnimationSettingResult(session.getState().document, "hero");
  expect(result.setting).toBeUndefined();
  expect(result.diagnostics).toEqual([{ path: `markers[0].meta.animation.graph.layers[0].transitions[${index}].to`, message: "Transition references an unknown state.", repair: "Choose a state declared in this layer; only from may use *." }]);
  for (const html of [inspector(), panel()]) {
    expect(html).toContain(result.diagnostics[0]!.path);
    expect(html).toContain(result.diagnostics[0]!.repair);
    expect(html).toContain('aria-label="Animation diagnostics"');
    expect(html).not.toContain('aria-label="Hold animation pose"');
    expect(html).not.toContain('aria-label="Graph preview time"');
    expect(html).not.toContain('aria-label="Crossfade seconds');
  }
  expect(inspector()).toContain('aria-label="Replace invalid animation override"');
  expect(panel()).toContain("Remove invalid animation override");
  const missingAssetInspector = renderToStaticMarkup(createElement(GameProvider, { context: ctx }, createElement(InspectorPanel, { session, ui })));
  const missingAssetGraph = renderToStaticMarkup(createElement(AnimationGraphPanel, { session, ui, rigged: [] }));
  expect(missingAssetInspector).toContain(result.diagnostics[0]!.path);
  expect(missingAssetInspector).toContain('<option value="custom" disabled=""');
  expect(missingAssetGraph).toContain(result.diagnostics[0]!.path);
  expect(missingAssetGraph).toContain("Remove invalid animation override");
  expect(session.getState().document).toEqual(document);
  const marker = session.getState().document.markers[0]!;
  session.dispatch({ type: "setMarker", id: marker.id, patch: { meta: { ...marker.meta, ...animationMetaPatch(setAnimationMode(undefined, "auto")) } } });
  expect(readAnimationSettingResult(session.getState().document, "hero")).toEqual({ setting: "auto", diagnostics: [] });
  session.dispatch({ type: "undo" });
  expect(readAnimationSettingResult(session.getState().document, "hero")).toEqual(result);
  expect(session.getState().document).toEqual(document);
  session.dispatch({ type: "redo" });
  const host = createEditorHost({ gameId: "diagnostic-replacement", layers: {} });
  host.api.getSession().dispatch({ type: "replaceDocument", document: session.getState().document });
  const exported = host.api.handle({ method: "export_document" });
  expect(exported.ok).toBe(true);
  const reopened = createEditorHost({ gameId: "diagnostic-reload", layers: {} });
  expect(reopened.api.handle({ method: "import_document", json: (exported.result as { json: string }).json }).ok).toBe(true);
  expect(readAnimationSettingResult(reopened.api.getSession().getState().document, "hero")).toEqual({ setting: "auto", diagnostics: [] });
  expect(reopened.api.getSession().getState().document.markers[0]!.meta?.routeId).toBe("keep-me");
  host.dispose();reopened.dispose();
});


test("unrelated graph and role edits retain an explicitly empty one-shot map", () => {
  const graph = effectiveAnimGraph("auto", CLIPS)!.graph;
  const animation = { states: { idle: "Idle", walk: "Walking_A" }, oneShots: {} };
  expect(setTransitionDuration(animation, graph, "base", 0, 0.35).oneShots).toEqual({});
  expect(setLocomotionClip(animation, "run", "Running_A").oneShots).toEqual({});
  expect(setLocomotionNumber(animation, "fadeSec", 0.1).oneShots).toEqual({});
  expect(clearAnimGraph({ ...animation, graph })).toEqual(animation);
  expect(setOneShotClip({ ...animation, oneShots: { hit: "Hit_A" } }, "hit", null).oneShots).toBeUndefined();
});
