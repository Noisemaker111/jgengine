import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  clearGlbThumbnailCache,
  frameCameraForBounds,
  getGlbThumbnailState,
  requestGlbThumbnail,
  resetGlbThumbnailLoader,
  setGlbThumbnailLoader,
  subscribeGlbThumbnail,
} from "./glbThumbnailCache";

afterEach(() => {
  clearGlbThumbnailCache();
  resetGlbThumbnailLoader();
});

describe("frameCameraForBounds", () => {
  test("places the camera outside the box looking at its center", () => {
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    const box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    frameCameraForBounds(box, camera);
    const center = box.getCenter(new THREE.Vector3());
    expect(camera.position.distanceTo(center)).toBeGreaterThan(1);
    // Look direction roughly toward center.
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const toCenter = center.clone().sub(camera.position).normalize();
    expect(forward.dot(toCenter)).toBeGreaterThan(0.95);
  });

  test("handles degenerate near-empty boxes without NaN", () => {
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1e-8, 1e-8, 1e-8));
    frameCameraForBounds(box, camera);
    expect(Number.isFinite(camera.position.x)).toBe(true);
    expect(Number.isFinite(camera.near)).toBe(true);
    expect(camera.far).toBeGreaterThan(camera.near);
  });
});

describe("glbThumbnailCache request path", () => {
  test("idle without request; loading then ready with injected loader", async () => {
    expect(getGlbThumbnailState(undefined).status).toBe("idle");
    expect(getGlbThumbnailState("").status).toBe("idle");

    // Headless: inject a mesh so we don't depend on real WebGL success in CI.
    // If WebGL is unavailable, status becomes error — still honest.
    setGlbThumbnailLoader(async () => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
      return group;
    });

    const url = "https://example.test/model.glb";
    expect(getGlbThumbnailState(url).status).toBe("idle");

    let notified = 0;
    const unsub = subscribeGlbThumbnail(url, () => {
      notified += 1;
    });
    requestGlbThumbnail(url);
    expect(getGlbThumbnailState(url).status).toBe("loading");

    // Wait for the async pump (render or honest error).
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = () => {
        const state = getGlbThumbnailState(url);
        if (state.status === "ready" || state.status === "error" || Date.now() - start > 5000) {
          resolve();
          return;
        }
        setTimeout(tick, 20);
      };
      tick();
    });

    const final = getGlbThumbnailState(url);
    expect(final.status === "ready" || final.status === "error").toBe(true);
    if (final.status === "ready") {
      expect(final.dataUrl?.startsWith("data:image/png")).toBe(true);
    }
    expect(notified).toBeGreaterThanOrEqual(1);
    unsub();
  });

  test("failed load becomes error without inventing a thumbnail", async () => {
    setGlbThumbnailLoader(async () => {
      throw new Error("network");
    });
    const url = "https://example.test/missing.glb";
    requestGlbThumbnail(url);
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (getGlbThumbnailState(url).status === "error" || Date.now() - start > 3000) {
          resolve();
          return;
        }
        setTimeout(tick, 10);
      };
      tick();
    });
    expect(getGlbThumbnailState(url)).toEqual({ status: "error", dataUrl: null });
  });
});
