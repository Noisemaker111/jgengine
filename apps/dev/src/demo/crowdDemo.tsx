import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, terrain } from "@jgengine/core/world/features";

import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import { sharedGltfLoader } from "@jgengine/shell/render/modelLoad";
import type { PlayableGame } from "@jgengine/shell/registry";
import { SkinnedInstances, type CrowdInstance } from "@jgengine/shell/render/SkinnedInstances";

const OBSERVER = "observer";
const RIGS = ["Knight", "Rogue", "Barbarian", "Mage"] as const;
const CLIPS = ["Idle", "Walking_A", "Running_A", "Cheer", "Unarmed_Idle", "Spellcasting"] as const;
const PER_RIG = 50;

function crowdFor(rig: number): CrowdInstance[] {
  const rng = seededRng(`crowd-${RIGS[rig]}`);
  const members: CrowdInstance[] = [];
  for (let i = 0; i < PER_RIG; i += 1) {
    const slot = rig * PER_RIG + i;
    const column = slot % 20;
    const row = Math.floor(slot / 20);
    members.push({
      position: [(column - 9.5) * 1.6 + (rng() - 0.5) * 0.6, 0, -row * 1.8 + (rng() - 0.5) * 0.6],
      rotationY: Math.PI + (rng() - 0.5) * 0.8,
      clip: CLIPS[Math.floor(rng() * CLIPS.length)]!,
      timeOffset: rng() * 3,
      speed: 0.85 + rng() * 0.3,
    });
  }
  return members;
}

const crowds = RIGS.map((_rig, index) => crowdFor(index));

const ground = environment({
  terrain: terrain({ bounds: { w: 80, d: 80 }, height: 0, seed: "crowd" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [OBSERVER]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "skinned-crowd",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(OBSERVER, { id: ctx.player.userId, position: [0, 0, -24], role: "player" });
}

function CrowdCaption() {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/70">
        200 animated KayKit characters: four rigs, one instanced draw per material each, clips baked to bone textures.
      </div>
    </div>
  );
}

/** Baseline for the frame-time comparison: the same crowd as ordinary skinned meshes, one mixer each. */
function MixerCrowd({ url, instances }: { url: string; instances: readonly CrowdInstance[] }) {
  const gltf = useLoader(sharedGltfLoader, url);
  const members = useMemo(
    () =>
      instances.map((instance) => {
        const scene = cloneSkinned(gltf.scene);
        scene.traverse((object) => {
          object.castShadow = true;
          object.receiveShadow = true;
        });
        scene.position.set(...instance.position);
        scene.rotation.y = instance.rotationY ?? 0;
        scene.scale.setScalar(0.7);
        const mixer = new THREE.AnimationMixer(scene);
        const action = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, instance.clip)!);
        action.play();
        action.time = instance.timeOffset ?? 0;
        action.timeScale = instance.speed ?? 1;
        return { scene, mixer };
      }),
    [gltf, instances],
  );
  useFrame((_three, delta) => {
    for (const member of members) member.mixer.update(delta);
  });
  return (
    <>
      {members.map((member, index) => (
        <primitive key={index} object={member.scene} />
      ))}
    </>
  );
}

function crowdGame(instanced: boolean): PlayableGame {
  return {
    game,
    content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
    loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
    GameUI: CrowdCaption,
    backdrop: { sky: { preset: "day" }, fog: { color: "#c9d8e4", near: 40, far: 140 } },
    environment: () => (
      <>
        <EnvironmentScene feature={ground} />
        {RIGS.map((rig, index) =>
          instanced ? (
            <SkinnedInstances key={rig} url={`/models/kaykit-adventurers/${rig}.glb`} clips={CLIPS} instances={crowds[index]!} modelScale={0.7} />
          ) : (
            <MixerCrowd key={rig} url={`/models/kaykit-adventurers/${rig}.glb`} instances={crowds[index]!} />
          ),
        )}
      </>
    ),
    camera: { initialDistance: 18, initialHeight: 7, minDistance: 6, maxDistance: 60, targetHeight: 1, maxPolarAngle: 1.45 },
  };
}

export const crowdDemoGame = crowdGame(true);
export const crowdMixerDemoGame = crowdGame(false);
