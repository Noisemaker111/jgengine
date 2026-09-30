import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, terrain } from "@jgengine/core/world/features";
import { defineStore } from "@jgengine/core/store/defineStore";
import { useStore } from "@jgengine/react/store";
import { useGameContext } from "@jgengine/react/provider";

import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import { sharedGltfLoader } from "@jgengine/shell/render/modelLoad";
import type { PlayableGame } from "@jgengine/shell/registry";
import { SkinnedInstances, type CrowdInstance } from "@jgengine/shell/render/SkinnedInstances";
import { cloneModelScene, disposeModelScene } from "@jgengine/shell/render/modelRender";
import { useModelAnimation } from "@jgengine/shell/render/useModelAnimation";

const OBSERVER = "observer";
const RIGS = ["Knight", "Rogue", "Barbarian", "Mage"] as const;
const CLIPS = ["Idle", "Walking_A", "Running_A", "Cheer", "Unarmed_Idle", "Spellcasting"] as const;
const PER_RIG = 50;
const crowdVisible = defineStore("crowd.visible", true);
const crowdPaused = defineStore("crowd.paused", false);

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

function CrowdCaption({ instanced }: { instanced: boolean }) {
  const ctx = useGameContext();
  const visible = useStore(crowdVisible);
  const paused = useStore(crowdPaused);
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="pointer-events-auto absolute left-4 top-4 flex gap-2">
        <button type="button" onClick={() => crowdVisible.update(ctx, (value) => !value)} className="rounded border border-white/25 bg-neutral-900 px-4 py-2 text-sm text-white">
          {visible ? "Hide crowd" : "Show crowd"}
        </button>
        {!instanced && <button type="button" onClick={() => crowdPaused.update(ctx, (value) => !value)} className="rounded border border-white/25 bg-neutral-900 px-4 py-2 text-sm text-white">
          {paused ? "Resume animations" : "Pause animations"}
        </button>}
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/70">
        {instanced ? "200 animated KayKit characters: four rigs, instanced draws with baked bone textures." : "200 animated KayKit characters: independent model instances and animation mixers."}
      </div>
    </div>
  );
}

function CrowdScene({ instanced }: { instanced: boolean }) {
  const visible = useStore(crowdVisible);
  return (
    <>
      <EnvironmentScene feature={ground} />
      {visible && RIGS.map((rig, index) =>
        instanced ? (
          <SkinnedInstances key={rig} url={`/models/kaykit-adventurers/${rig}.glb`} clips={CLIPS} instances={crowds[index]!} modelScale={0.7} />
        ) : (
          <MixerCrowd key={rig} url={`/models/kaykit-adventurers/${rig}.glb`} instances={crowds[index]!} />
        ),
      )}
    </>
  );
}

function MixerCrowd({ url, instances }: { url: string; instances: readonly CrowdInstance[] }) {
  const gltf = useLoader(sharedGltfLoader, url);
  return (
    <>
      {instances.map((instance, index) => (
        <MixerCrowdMember key={index} source={gltf.scene} clips={gltf.animations} instance={instance} />
      ))}
    </>
  );
}

function MixerCrowdMember({ source, clips, instance }: { source: THREE.Object3D; clips: THREE.AnimationClip[]; instance: CrowdInstance }) {
  const scene = useMemo(() => cloneModelScene(source, { cloneMaterials: false }), [source]);
  const paused = useStore(crowdPaused);
  useModelAnimation(scene, clips, { clip: instance.clip, time: instance.timeOffset ?? 0, timeScale: instance.speed ?? 1, paused });
  useEffect(() => () => disposeModelScene(scene), [scene]);
  return <primitive object={scene} position={instance.position} rotation-y={instance.rotationY ?? 0} scale={0.7} dispose={null} />;
}

function crowdGame(instanced: boolean): PlayableGame {
  return {
    game,
    content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
    loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
    GameUI: () => <CrowdCaption instanced={instanced} />,
    backdrop: { sky: { preset: "day" }, fog: { color: "#c9d8e4", near: 40, far: 140 } },
    environment: () => <CrowdScene instanced={instanced} />,
    capture: {
      probe: (ctx) => {
        const position = ctx.scene.entity.get(ctx.player.userId)?.position ?? [0, 0, 0];
        return { x: position[0]!, z: position[2]!, visible: Number(crowdVisible.read(ctx)), paused: Number(crowdPaused.read(ctx)) };
      },
    },
    camera: { initialDistance: 18, initialHeight: 7, minDistance: 6, maxDistance: 60, targetHeight: 1, maxPolarAngle: 1.45 },
  };
}

export const crowdDemoGame = crowdGame(true);
export const crowdMixerDemoGame = crowdGame(false);
