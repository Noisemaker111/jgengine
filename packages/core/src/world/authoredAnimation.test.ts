import { describe, expect, test } from "bun:test";
import type { AnimGraph } from "../anim/animGraph";
import { createEditorSession } from "../editor/commands";
import { createEmptyEditorDocument, exportEditorDocumentJson, importEditorDocumentJson } from "../editor/document";
import type { ModelAnimationConfig } from "../game/playableGame";
import { createAuthoredAnimationReader, readAuthoredAnimation, readAuthoredAnimationValue } from "./authoredAnimation";

const defaults: ModelAnimationConfig = { states: { idle: "Idle", walk: "Walking_A" }, oneShots: { death: ["Death_A", "Death_B"] } };
const graph: AnimGraph = {
  layers: [{
    id: "base", entry: "idle",
    states: { idle: { kind: "clip", clip: "Idle" }, attack: { kind: "clip", clip: "Attack_A", variants: ["Attack_A", "Attack_B"], loop: false }, death: { kind: "clip", clip: "Death_A", loop: false } },
    transitions: [{ from: "*", to: "death", trigger: "death" }, { from: "idle", to: "attack", trigger: "attack" }, { from: "attack", to: "idle", exitTime: 1 }],
  }],
};
const document = (animation?: unknown) => ({ markers: [{ id: "unrelated" }, { id: "player", meta: { animation } }] });

describe("authored character animation", () => {
  test("omitted marker and override retain the exact game default", () => {
    expect(readAuthoredAnimation(document(), "player", defaults).animation).toBe(defaults);
    expect(readAuthoredAnimation(document(), "missing", defaults)).toEqual({ animation: defaults, diagnostics: [] });
    expect(readAuthoredAnimation(document(), "player").animation).toBeUndefined();
    expect(readAuthoredAnimation(document(), "player", "auto").animation).toBe("auto");
  });

  test("explicit modes and authored objects replace defaults without injecting combat or roles", () => {
    for (const mode of ["auto", "none"] as const) expect(readAuthoredAnimation(document(mode), "player", defaults).animation).toBe(mode);
    const authored = { clip: "Walking_A", paused: true, time: -0.5, timeScale: -1, loop: false };
    expect(readAuthoredAnimation(document(authored), "player", defaults)).toEqual({ animation: authored, diagnostics: [] });
    expect(readAuthoredAnimation(document(authored), "player", defaults).animation).toBe(authored);
    expect(readAuthoredAnimation(document({}), "player", defaults).animation).toEqual({});
  });

  test("preserves partial, blank and explicitly empty states during editing", () => {
    for (const states of [{}, { run: "Running_A" }, { idle: "Idle", walk: "" }, { idle: "", run: "Running_A" }]) {
      const authored = { clip: "Idle", states };
      expect(readAuthoredAnimation(document(authored), "player", defaults)).toEqual({ animation: authored, diagnostics: [] });
    }
    const authored = { states: { idle: "Idle", walk: "Walking_A", walkSpeed: 0, runSpeed: 6, fadeSec: 0 } };
    expect(readAuthoredAnimation(document(authored), "player", defaults).animation).toBe(authored);
  });

  test("preserves one-shot variant order and deliberate empty mappings", () => {
    for (const oneShots of [{}, { attack: ["Attack_B", "Attack_A"], death: "Death_A", hit: [] }]) {
      const authored = { oneShots };
      expect(readAuthoredAnimation(document(authored), "player", defaults)).toEqual({ animation: authored, diagnostics: [] });
    }
  });

  test("valid graph replacement preserves combat variants and terminal death", () => {
    const result = readAuthoredAnimation(document({ graph }), "player", defaults);
    expect(result.diagnostics).toEqual([]);
    expect((result.animation as ModelAnimationConfig).graph).toBe(graph);
    expect((result.animation as ModelAnimationConfig).states).toBeUndefined();
    expect(graph.layers[0]!.transitions.some((transition) => transition.from === "death")).toBe(false);
  });

  test("malformed known fields reject the whole authored override with located repairs", () => {
    const cases = [
      [null, ""], [[], ""], ["unexpected", ""],
      [{ clip: 3 }, ".clip"], [{ loop: 1 }, ".loop"], [{ paused: "yes" }, ".paused"],
      [{ time: Infinity }, ".time"], [{ timeScale: "fast" }, ".timeScale"],
      [{ states: [] }, ".states"], [{ states: { run: true } }, ".states.run"],
      [{ states: { walkSpeed: NaN } }, ".states.walkSpeed"], [{ states: { runSpeed: Infinity } }, ".states.runSpeed"], [{ states: { fadeSec: "slow" } }, ".states.fadeSec"],
      [{ oneShots: [] }, ".oneShots"], [{ oneShots: { attack: ["Attack_A", 2] } }, '.oneShots["attack"]'],
    ] as const;
    for (const [authored, suffix] of cases) {
      const result = readAuthoredAnimation(document(authored), "player", defaults);
      expect(result.animation).toBe(defaults);
      expect(result.diagnostics[0]?.path).toBe(`markers[1].meta.animation${suffix}`);
      expect(result.diagnostics[0]?.repair).toContain("inherit the game setting");
    }
  });

  test("does not silently drop a malformed saved combat transition", () => {
    const corrupted = structuredClone(graph);
    (corrupted.layers[0]!.transitions[0] as { to: string }).to = "missingDeath";
    const result = readAuthoredAnimation(document({ graph: corrupted }), "player", defaults);
    expect(result.animation).toBe(defaults);
    expect(result.diagnostics[0]?.path).toBe("markers[1].meta.animation.graph.layers[0].transitions[0].to");
    expect(corrupted.layers[0]!.transitions).toHaveLength(3);
    expect(result.diagnostics[0]?.repair.length).toBeGreaterThan(0);
  });

  test("rejects invalid dormant known fields instead of leaking malformed persisted config", () => {
    const result = readAuthoredAnimation(document({ graph, states: { walk: false } }), "player", defaults);
    expect(result.animation).toBe(defaults);
    expect(result.diagnostics[0]?.path).toBe("markers[1].meta.animation.states.walk");
  });

  test("memoizes by immutable document while normal edits, undo, save and reload resolve live", () => {
    const original = createEmptyEditorDocument();
    original.markers.push({ id: "player", kind: "player_spawn", position: { x: 2, y: 0, z: 3 }, meta: { role: "player_spawn" } });
    const session = createEditorSession(original);
    let current = session.getState().document;
    const read = createAuthoredAnimationReader(() => current, "player", defaults);
    const baseline = read();
    expect(read()).toBe(baseline);
    session.dispatch({ type: "setMarker", id: "player", patch: { meta: { ...original.markers[0]!.meta, animation: { graph } } } });
    current = session.getState().document;
    const edited = read();
    expect(edited).not.toBe(baseline);
    expect((edited.animation as ModelAnimationConfig).graph).toEqual(graph);
    expect(read()).toBe(edited);
    session.dispatch({ type: "undo" });
    current = session.getState().document;
    expect(read().animation).toBe(defaults);
    session.dispatch({ type: "redo" });
    current = importEditorDocumentJson(exportEditorDocumentJson(session.getState().document));
    expect((read().animation as ModelAnimationConfig).graph).toEqual(graph);
    expect(current.markers[0]!.meta?.role).toBe("player_spawn");
    expect(current.markers[0]!.position).toEqual(original.markers[0]!.position);
    session.dispatch({ type: "setMarker", id: "player", patch: { meta: { animation: { graph, timeScale: "fast" } } } });
    current = session.getState().document;
    expect(read().animation).toBe(defaults);
    expect(read().diagnostics[0]?.path).toBe("markers[0].meta.animation.timeScale");
  });
});


test("authored clocks and auto derivation are validated without discarding valid data", () => {
  for (const clock of ["real", "game"] as const) {
    const authored = { clock, auto: true, states: {}, oneShots: {}, timeScale: -1, identity: { rig: "original" } };
    expect(readAuthoredAnimation(document(authored), "player", defaults)).toEqual({ animation: authored, diagnostics: [] });
    expect(readAuthoredAnimation(document(authored), "player", defaults).animation).toBe(authored);
  }
  for (const [key, value] of [["clock", "simulation"], ["clock", false], ["clock", null], ["auto", false], ["auto", "true"], ["auto", null]] as const) {
    const authored = { clip: "Idle", [key]: value };
    const result = readAuthoredAnimation(document(authored), "player", defaults);
    expect(result.animation).toBe(defaults);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.path).toBe(`markers[1].meta.animation.${key}`);
    expect(result.diagnostics[0]!.repair).toContain(key === "clock" ? "real or game" : "true");
    expect(authored[key]).toBe(value);
  }
});


test("located value validation shares exact document-reader defaults and diagnostics without marker lookup", () => {
  const invalid = { clock: "calendar", auto: false };
  const value = readAuthoredAnimationValue(invalid, "markers[1].meta.animation", defaults);
  expect(value).toEqual(readAuthoredAnimation(document(invalid), "player", defaults));
  expect(value.animation).toBe(defaults);
  expect(value.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(["markers[1].meta.animation.clock", "markers[1].meta.animation.auto"]);
  expect(readAuthoredAnimationValue(undefined, "placement.animation", defaults).animation).toBe(defaults);
  const authored = { graph, oneShots: {}, clock: "game", timeScale: -0.5, notes: { rig: "keep" } };
  const valid = readAuthoredAnimationValue(authored, "placements[7].animation", defaults);
  expect(valid.diagnostics).toEqual([]);
  expect(valid.animation).toEqual(authored);
  expect((valid.animation as ModelAnimationConfig).graph).toBe(graph);
  const badGraph = structuredClone(graph);
  badGraph.layers[0]!.transitions[0]!.to = "missing";
  expect(readAuthoredAnimationValue({ graph: badGraph }, "placements[7].animation", defaults).diagnostics[0]!.path).toBe("placements[7].animation.graph.layers[0].transitions[0].to");
});
