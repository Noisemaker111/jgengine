import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { Group } from "three";

import { PlayerCharacterFigure } from "@/user/components/PlayerCharacterFigure";
import { LLMVILLE_CHARACTER_PALETTE, type CharacterLook } from "@/user/playerCharacterFigure";

function RotatingFigure({ look }: { look: CharacterLook }) {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    group.rotation.y += delta * 0.45;
  });

  return (
    <group ref={groupRef}>
      <PlayerCharacterFigure look={look} />
    </group>
  );
}

function CharacterStage({ look }: { look: CharacterLook }) {
  return (
    <>
      <color attach="background" args={[LLMVILLE_CHARACTER_PALETTE.ink]} />
      <fog attach="fog" args={[LLMVILLE_CHARACTER_PALETTE.ink, 4, 9]} />
      <ambientLight intensity={0.55} color={LLMVILLE_CHARACTER_PALETTE.cream} />
      <hemisphereLight
        args={[LLMVILLE_CHARACTER_PALETTE.teal, LLMVILLE_CHARACTER_PALETTE.charcoal, 0.42]}
      />
      <directionalLight
        castShadow
        position={[2.5, 4.5, 3.5]}
        intensity={0.85}
        color={LLMVILLE_CHARACTER_PALETTE.cream}
        shadow-mapSize={[512, 512]}
      />
      <directionalLight position={[-2.5, 2.5, -2]} intensity={0.28} color={LLMVILLE_CHARACTER_PALETTE.amber} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[0.72, 48]} />
        <meshStandardMaterial
          color={LLMVILLE_CHARACTER_PALETTE.charcoal}
          roughness={0.94}
          metalness={0}
          emissive={LLMVILLE_CHARACTER_PALETTE.deepTeal}
          emissiveIntensity={0.04}
        />
      </mesh>
      <RotatingFigure look={look} />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 2.05}
        minAzimuthAngle={-Math.PI / 3}
        maxAzimuthAngle={Math.PI / 3}
        target={[0, 0.75, 0]}
      />
    </>
  );
}

interface CharacterCustomizeViewportProps {
  look: CharacterLook;
  className?: string;
}

export function CharacterCustomizeViewport({ look, className }: CharacterCustomizeViewportProps) {
  return (
    <div className={className}>
      <Canvas
        shadows
        camera={{ position: [0, 1.05, 2.65], fov: 38, near: 0.1, far: 20 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <CharacterStage look={look} />
        </Suspense>
      </Canvas>
    </div>
  );
}
