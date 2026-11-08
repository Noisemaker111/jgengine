import { expect, test } from "bun:test";
import * as THREE from "three";
import { UnrealBloomPass } from "three-stdlib";
import { BloomPass } from "./bloomPass.draw";

/** A renderer that records each draw as its target and material, and each clear. */
function recordingRenderer() {
  const log: string[] = [];
  let target: THREE.WebGLRenderTarget | null = null;
  const names = new Map<object, string>();
  const name = (thing: object | null, prefix: string) => {
    if (thing === null) return "screen";
    if (!names.has(thing)) names.set(thing, `${prefix}${names.size}`);
    return names.get(thing)!;
  };
  const renderer = {
    autoClear: true,
    state: { buffers: { stencil: { setTest: () => {} } } },
    getClearColor: (color: THREE.Color) => color,
    getClearAlpha: () => 1,
    setClearColor: () => {},
    setRenderTarget: (next: THREE.WebGLRenderTarget | null) => {
      target = next;
    },
    clear: () => log.push(`clear ${name(target, "t")}`),
    render: (mesh: THREE.Mesh) => log.push(`draw ${name(mesh.material as THREE.Material, "m")} -> ${name(target, "t")}`),
  } as unknown as THREE.WebGLRenderer;
  return { renderer, log, name };
}

function drawsOf(pass: UnrealBloomPass) {
  const recording = recordingRenderer();
  // Name the pass's own targets and materials in a fixed order, so both passes' logs line up.
  for (const thing of [pass.renderTargetBright, ...pass.renderTargetsHorizontal, ...pass.renderTargetsVertical]) recording.name(thing, "t");
  for (const thing of [pass.materialHighPassFilter, ...pass.separableBlurMaterials, pass.compositeMaterial, pass.materialCopy]) recording.name(thing, "m");
  const read = new THREE.WebGLRenderTarget(64, 32);
  recording.name(read, "t");
  pass.render(recording.renderer, new THREE.WebGLRenderTarget(64, 32), read, 0, false);
  return recording.log;
}

test("the bloom draws three-stdlib's sequence without the twelve clears", () => {
  const three = drawsOf(new UnrealBloomPass(new THREE.Vector2(64, 32), 0.3, 0.5, 0.8));
  const lean = drawsOf(new BloomPass(new THREE.Vector2(64, 32), 0.3, 0.5, 0.8));
  expect(three.filter((entry) => entry.startsWith("clear"))).toHaveLength(12);
  expect(lean.some((entry) => entry.startsWith("clear"))).toBe(false);
  expect(lean).toEqual(three.filter((entry) => entry.startsWith("draw")));
  expect(lean).toHaveLength(13);
});

test("with no clear, no bloom quad is depth tested against a target's stale depth", () => {
  const pass = new BloomPass(new THREE.Vector2(64, 32), 0.3, 0.5, 0.8);
  for (const material of [pass.materialHighPassFilter, ...pass.separableBlurMaterials, pass.compositeMaterial]) {
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
  }
});
