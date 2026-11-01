import { expect, test } from "bun:test";
import * as THREE from "three";

import { runToEnd } from "@jgengine/core/run/slicedWork";
import { cellProxyJob } from "./cellProxy.draw";

test("a proxy merges every placed piece into one coloured mesh in world space", () => {
  const material = new THREE.MeshStandardMaterial({ color: "#ff0000" });
  const box = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  const parts = [0, 10].map((x) => ({ geometry: box, matrix: new THREE.Matrix4().makeTranslation(x, 0, 0), material }));
  const proxy = runToEnd(cellProxyJob(parts, 0.1));
  proxy.computeBoundingBox();
  expect(proxy.boundingBox?.min.x).toBeCloseTo(-0.5, 1);
  expect(proxy.boundingBox?.max.x).toBeCloseTo(10.5, 1);
  const colors = proxy.getAttribute("color");
  expect(colors.getX(0)).toBeCloseTo(1, 5);
  expect(colors.getY(0)).toBeCloseTo(0, 5);
});

test("a coarser cluster keeps fewer triangles, and detail under it collapses away", () => {
  const material = new THREE.MeshStandardMaterial();
  const sphere = new THREE.SphereGeometry(1, 48, 32);
  const parts = [{ geometry: sphere, matrix: new THREE.Matrix4(), material }];
  const fine = runToEnd(cellProxyJob(parts, 0.05)).index?.count ?? 0;
  const coarse = runToEnd(cellProxyJob(parts, 0.5)).index?.count ?? 0;
  expect(coarse).toBeGreaterThan(0);
  expect(coarse).toBeLessThan(fine / 4);
  expect(runToEnd(cellProxyJob([{ geometry: new THREE.SphereGeometry(0.01), matrix: new THREE.Matrix4().makeTranslation(0.5, 0.5, 0.5), material }], 1)).index?.count).toBe(0);
});

test("a proxy build yields between slices and rejects a meaningless cluster size", () => {
  const material = new THREE.MeshStandardMaterial();
  const parts = [{ geometry: new THREE.SphereGeometry(1, 128, 64), matrix: new THREE.Matrix4(), material }];
  const job = cellProxyJob(parts, 0.1);
  expect(job.next().done).toBe(false);
  expect(() => runToEnd(cellProxyJob(parts, 0))).toThrow();
});
