import { expect, test } from "bun:test";
import * as THREE from "three";

import { syncSpriteFrame } from "./spriteRender";

test("atlas frame changes update UVs without uploading the image or changing another sprite", () => {
  const source = new THREE.Texture();
  const first = source.clone();
  const second = source.clone();
  const textureVersion = first.version;
  const imageVersion = first.source.version;
  syncSpriteFrame(first, { x: 16, y: 8, w: 16, h: 8 }, [64, 32]);
  expect(first.repeat.toArray()).toEqual([0.25, 0.25]);
  expect(first.offset.toArray()).toEqual([0.25, 0.5]);
  first.updateMatrix();
  expect(new THREE.Vector2(1, 1).applyMatrix3(first.matrix).toArray()).toEqual([0.5, 0.75]);
  syncSpriteFrame(first, { x: 32, y: 0, w: 16, h: 8 }, [64, 32]);
  expect(first.offset.toArray()).toEqual([0.5, 0.75]);
  expect(first.version).toBe(textureVersion);
  expect(first.source.version).toBe(imageVersion);
  expect(first.source).toBe(second.source);
  expect(second.offset.toArray()).toEqual([0, 0]);
  expect(source.repeat.toArray()).toEqual([1, 1]);
});
