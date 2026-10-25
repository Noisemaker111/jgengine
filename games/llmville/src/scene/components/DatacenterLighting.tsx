import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DirectionalLight, Object3D } from "three";

import { DATACENTER_CEILING_HEIGHT } from "@llmville/game/datacenter/layout";
import { readPlayerPosition } from "@/runtime/playerPosition";
import type { GameEngine } from "@/runtime/gameEngine";

const KEY_OFFSET_X = 8;
const KEY_OFFSET_Z = 6;
const KEY_HEIGHT = DATACENTER_CEILING_HEIGHT + 10;
const SHADOW_EXTENT = 18;

export function DatacenterLighting({ engine }: { engine: GameEngine }) {
  const keyRef = useRef<DirectionalLight>(null);
  const target = useMemo(() => new Object3D(), []);

  useEffect(() => {
    const key = keyRef.current;
    if (key) key.target = target;
  }, [target]);

  useFrame(() => {
    const player = readPlayerPosition(engine);
    keyRef.current?.position.set(player.x + KEY_OFFSET_X, KEY_HEIGHT, player.z + KEY_OFFSET_Z);
    target.position.set(player.x, 0, player.z);
    target.updateMatrixWorld();
  });

  return (
    <>
      <ambientLight intensity={0.85} color="#fff0d6" />
      <hemisphereLight args={["#f9e4bf", "#526d60", 0.9]} />
      <directionalLight
        ref={keyRef}
        intensity={1.4}
        color="#ffe1ae"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={KEY_HEIGHT + SHADOW_EXTENT * 2}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
      />
      <primitive object={target} />
    </>
  );
}
