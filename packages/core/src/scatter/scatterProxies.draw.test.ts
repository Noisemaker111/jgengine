import { expect, test } from "bun:test";
import * as THREE from "three";

import { buildScatterProxy } from "./scatterProxies.draw";

/** Every triangle corner in draw order: what the GPU rasterizes, whatever the vertex sharing. */
function corners(geometry: THREE.BufferGeometry, name: string): number[] {
  const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
  const index = geometry.index;
  const count = index === null ? attribute.count : index.count;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const vertex = index === null ? i : index.getX(i);
    for (let c = 0; c < attribute.itemSize; c += 1) out.push(attribute.getComponent(vertex, c));
  }
  return out;
}

test("a scatter proxy keeps its parts' shared vertices and draws the same corners as the flattened parts", () => {
  for (const item of ["tree", "pine", "oak", "bush", "rock", "grass", "palm", "cypress"]) {
    const proxy = buildScatterProxy(item);
    const flat = proxy.toNonIndexed();
    expect(proxy.index).not.toBeNull();
    for (const name of ["position", "normal", "color"]) expect(corners(proxy, name)).toEqual(corners(flat, name));
    if (item === "tree") expect(proxy.getAttribute("position").count).toBeLessThan(proxy.index!.count);
    proxy.dispose();
    flat.dispose();
  }
});
