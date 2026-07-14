import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { readFirstPersonMuzzle } from "@jgengine/shell/camera";

const FLASH_SECONDS = 0.08;

interface Flash {
  id: number;
  position: [number, number, number];
}

export function MuzzleFlash({ ctx }: WorldOverlayProps) {
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const nextId = useRef(0);

  useEffect(
    () =>
      ctx.game.events.on("entity.animation", (event) => {
        if (event.event !== "fire" || event.instanceId !== ctx.player.userId) return;
        const point = new THREE.Vector3();
        if (!readFirstPersonMuzzle(point)) return;
        const id = nextId.current++;
        setFlashes((current) => [...current, { id, position: [point.x, point.y, point.z] }]);
        setTimeout(() => setFlashes((current) => current.filter((flash) => flash.id !== id)), FLASH_SECONDS * 1000);
      }),
    [ctx],
  );

  return (
    <>
      {flashes.map((flash) => (
        <pointLight key={flash.id} position={flash.position} color="#ffd27a" intensity={6} distance={4} decay={2} />
      ))}
    </>
  );
}
