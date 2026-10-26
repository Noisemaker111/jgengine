import type * as THREE from "three";

import type { SpriteAtlas } from "@jgengine/core/assets/spriteAtlas";

/** Update atlas UVs without invalidating the shared image upload. @internal */
export function syncSpriteFrame(texture: THREE.Texture, frame: SpriteAtlas["frames"][string], size: readonly [number, number]): void {
  texture.repeat.set(frame.w / size[0], frame.h / size[1]);
  texture.offset.set(frame.x / size[0], 1 - (frame.y + frame.h) / size[1]);
}
