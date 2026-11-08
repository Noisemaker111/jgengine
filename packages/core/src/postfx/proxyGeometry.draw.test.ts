import { expect, test } from "bun:test";
import * as THREE from "three";

import { proxyGeometry } from "./proxyGeometry.draw";

function geometry(extra: string[]): THREE.BufferGeometry {
  const made = new THREE.BufferGeometry();
  made.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  for (const name of extra) made.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(6), 2));
  made.setIndex([0, 1, 2]);
  return made;
}

test("meshes with different extra attributes get copies with only the kept ones, so they share one program", () => {
  const lightmapped = geometry(["uv", "uv1"]);
  const coloured = geometry(["uv", "color"]);
  const a = proxyGeometry(lightmapped, ["position"]);
  const b = proxyGeometry(coloured, ["position"]);
  expect(Object.keys(a.attributes)).toEqual(["position"]);
  expect(Object.keys(b.attributes)).toEqual(["position"]);
  // The buffers are the source's own: nothing is uploaded twice.
  expect(a.getAttribute("position")).toBe(lightmapped.getAttribute("position"));
  expect(a.index).toBe(lightmapped.index);
});

test("a copy is kept until the source changes its attributes or is disposed", () => {
  const source = geometry(["uv"]);
  const first = proxyGeometry(source, ["position"]);
  expect(proxyGeometry(source, ["position"])).toBe(first);
  source.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  const second = proxyGeometry(source, ["position"]);
  expect(second).not.toBe(first);
  expect(second.getAttribute("position")).toBe(source.getAttribute("position"));
  let disposed = false;
  second.addEventListener("dispose", () => { disposed = true; });
  source.dispose();
  expect(disposed).toBe(true);
});
