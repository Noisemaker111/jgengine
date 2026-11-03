import { describe, expect, test } from "bun:test";

import { bodyGlbModel, bodyModel, type BodyPlan } from "./bodyPlan";
import { encodeGlb } from "./glbWrite";

const TRIKE: BodyPlan = {
  torso: { length: 3, height: 1.4, width: 1.5 },
  legs: { pairs: 2, length: 0.9, thickness: 0.22 },
  head: { length: 1.1, height: 0.7, width: 0.7, snout: 0.3 },
  tail: { length: 1.6, thickness: 0.35 },
  features: { horns: { count: 3, length: 0.8 }, frill: 0.8, beak: true },
  colors: { body: "#7a8a5a", belly: "#c8c0a0", accent: "#e0d0b0" },
};

const RAPTOR: BodyPlan = {
  torso: { length: 1.2, height: 0.55, width: 0.45 },
  legs: { pairs: 2, length: 0.9, thickness: 0.09, biped: true, armScale: 0.45 },
  neck: { length: 0.45, thickness: 0.12, rise: 50 },
  head: { length: 0.45, height: 0.22, width: 0.2 },
  tail: { length: 1.4, thickness: 0.16 },
  colors: { body: "#6a5040" },
};

const SPIDER: BodyPlan = {
  torso: { length: 1.2, height: 0.7, width: 1 },
  legs: { pairs: 4, length: 1.3, thickness: 0.07 },
  head: { length: 0.5, height: 0.4, width: 0.5, snout: 0 },
  features: { mandibles: 0.25 },
  colors: { body: "#2a2420" },
};

const SNAKE: BodyPlan = {
  torso: { length: 1, height: 0.4, width: 0.4 },
  legs: { pairs: 0, length: 0, thickness: 0 },
  head: { length: 0.5, height: 0.3, width: 0.35, snout: 0.2 },
  serpent: { segments: 8 },
  colors: { body: "#4a6a30" },
};

/** The JSON chunk of a GLB, checking its header and chunk layout as a loader would. */
function readGlb(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binLength = view.getUint32(20 + jsonLength, true);
  expect(view.getUint32(24 + jsonLength, true)).toBe(0x004e4942);
  expect(binLength).toBe(json.buffers[0].byteLength);
  for (const viewDef of json.bufferViews) expect(viewDef.byteOffset + viewDef.byteLength).toBeLessThanOrEqual(binLength);
  return json;
}

describe("bodyModel", () => {
  test("a plan becomes a GLB with the five clips the engine's clip roles read", () => {
    const json = readGlb(encodeGlb(bodyGlbModel(TRIKE)));
    expect(json.animations.map((clip: { name: string }) => clip.name)).toEqual(["Idle", "Walk", "Run", "Attack", "Death"]);
    for (const clip of json.animations) for (const channel of clip.channels) expect(channel.target.node).toBeLessThan(json.nodes.length);
  });

  test("legs follow the plan: four for a quadruped, two plus arms for a biped, eight splayed for a spider, none for a snake", () => {
    const legs = (plan: BodyPlan) => bodyGlbModel(plan).nodes.filter((node) => node.name.startsWith("leg_")).length;
    expect(legs(TRIKE)).toBe(4);
    expect(legs(RAPTOR)).toBe(4);
    expect(legs(SPIDER)).toBe(8);
    expect(legs(SNAKE)).toBe(0);
    expect(bodyGlbModel(SNAKE).nodes.filter((node) => node.name.startsWith("tail_")).length).toBe(8);
  });

  test("features add geometry: a horned, frilled head carries more triangles than a plain one", () => {
    const headTriangles = (plan: BodyPlan) =>
      bodyGlbModel(plan)
        .nodes.find((node) => node.name === "head")!
        .primitives.reduce((sum, part) => sum + part.indices.length / 3, 0);
    expect(headTriangles(TRIKE)).toBeGreaterThan(headTriangles({ ...TRIKE, features: {} }) + 100);
  });

  test("the body stands on the ground: feet reach down to it and nothing sinks far below", () => {
    const model = bodyGlbModel(TRIKE);
    const world = (index: number): [number, number, number] => {
      const node = model.nodes[index]!;
      const at = node.translation;
      if (node.parent < 0) return [at[0], at[1], at[2]];
      const up = world(node.parent);
      return [up[0] + at[0], up[1] + at[1], up[2] + at[2]];
    };
    let lowest = Infinity;
    model.nodes.forEach((node, index) => {
      if (!node.name.startsWith("leg_")) return;
      const origin = world(index);
      for (const part of node.primitives) for (let i = 1; i < part.positions.length; i += 3) lowest = Math.min(lowest, origin[1] + part.positions[i]!);
    });
    expect(lowest).toBeGreaterThan(-0.15);
    expect(lowest).toBeLessThan(0.15);
  });

  test("the same plan always gives the same model, and a ModelConfig loads it animated at its height, built only when read", () => {
    let built = 0;
    const counted: BodyPlan = { ...RAPTOR, get torso() { built += 1; return RAPTOR.torso; } };
    const lazy = bodyModel(counted, 1.7);
    expect(built).toBe(0);
    void lazy.url;
    const once = built;
    expect(once).toBeGreaterThan(0);
    void lazy.url;
    expect(built).toBe(once);
    expect(encodeGlb(bodyGlbModel(RAPTOR))).toEqual(encodeGlb(bodyGlbModel(RAPTOR)));
    const config = bodyModel(RAPTOR, 1.7);
    expect(config.url.startsWith("data:model/gltf-binary;base64,")).toBe(true);
    expect(config.targetHeight).toBe(1.7);
    expect(config.animation).toBe("auto");
    const bytes = Uint8Array.from(atob(config.url.slice(config.url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    expect(bytes).toEqual(encodeGlb(bodyGlbModel(RAPTOR)));
  });
});
