import { useEffect, useMemo, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import { disposeObjectTree, SceneObjectAttach } from "@jgengine/core/frame/useEngineDraw.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { behaviorControl } from "@jgengine/core/scene/behaviorRuntime";
import type { PlayableGame } from "@jgengine/shell/registry";

import {
  createGuardSenses,
  GUARD_ACTIONS,
  GUARD_ID,
  GUARD_POSTS,
  GUARD_SENSES,
  guardBlackboard,
  guardGraph,
  PLAYER_SPAWN,
  registerGuardActions,
  WALL,
  type GuardSenses,
} from "./guardProbe";

const HERO = "hero";
const GUARD = "guard";

function Yard(): ReactNode {
  const rig = useMemo(() => {
    const root = new THREE.Group();
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: "#5b6b4a", roughness: 0.95 }));
    ground.receiveShadow = true;
    root.add(ground);
    const grid = new THREE.GridHelper(40, 40, "#3f4c33", "#4d5c3f");
    grid.position.y = 0.01;
    root.add(grid);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(WALL.maxX - WALL.minX, WALL.height, WALL.maxZ - WALL.minZ),
      new THREE.MeshStandardMaterial({ color: "#9a8f80", roughness: 0.9 }),
    );
    wall.position.set((WALL.minX + WALL.maxX) / 2, WALL.height / 2, (WALL.minZ + WALL.maxZ) / 2);
    wall.castShadow = true;
    wall.receiveShadow = true;
    root.add(wall);
    const ringGeo = new THREE.RingGeometry(0.35, 0.55, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#60a5fa" });
    for (const [x, z] of GUARD_POSTS) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.03, z);
      root.add(ring);
    }
    return root;
  }, []);
  useEffect(() => () => disposeObjectTree(rig), [rig]);
  return <SceneObjectAttach object={rig} />;
}

function GuardOverlay({ ctx }: WorldOverlayProps): ReactNode {
  const rig = useMemo(() => {
    const root = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.CircleGeometry(GUARD_SENSES.sightRange, 32, 0, (GUARD_SENSES.sightConeDeg * Math.PI) / 180),
      new THREE.MeshBasicMaterial({ color: "#fde047", transparent: true, opacity: 0.18, depthWrite: false }),
    );
    cone.rotation.x = -Math.PI / 2;
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.7, 24),
      new THREE.MeshBasicMaterial({ color: "#f87171" }),
    );
    marker.rotation.x = -Math.PI / 2;
    root.add(cone, marker);
    return { root, cone, marker };
  }, []);
  useEffect(() => () => disposeObjectTree(rig.root), [rig]);
  useFrameTask(() => {
    const guard = ctx.scene.entity.get(GUARD_ID);
    const board = behaviorControl(ctx).blackboard(GUARD_ID);
    if (guard === null || board === null) return;
    rig.cone.position.set(guard.position[0], 0.04, guard.position[2]);
    rig.cone.rotation.z = guard.rotationY - Math.PI / 2 - (GUARD_SENSES.sightConeDeg * Math.PI) / 360;
    rig.marker.visible = board["alerted"] === true;
    rig.marker.position.set(Number(board["lastKnownX"] ?? 0), 0.05, Number(board["lastKnownZ"] ?? 0));
  });
  return <SceneObjectAttach object={rig.root} />;
}

function guardState(ctx: GameContext | null): { label: string; confidence: number } {
  const board = ctx === null ? null : behaviorControl(ctx).blackboard(GUARD_ID);
  if (board === null) return { label: "—", confidence: 0 };
  return { label: board["alerted"] === true ? "investigating" : "patrolling", confidence: Number(board["confidence"] ?? 0) };
}

function GuardPanel({ read }: { read: () => GameContext | null }): ReactNode {
  const [state, setState] = useState(() => guardState(read()));
  useEffect(() => {
    const timer = setInterval(() => setState(guardState(read())), 100);
    return () => clearInterval(timer);
  }, [read]);
  return (
    <div className="pointer-events-none absolute left-5 top-5 rounded-lg bg-black/65 px-4 py-3 font-sans text-sm text-white">
      <div className="mb-1 text-base font-semibold">Guard probe</div>
      <div className="flex justify-between gap-6"><span className="opacity-70">guard</span><span>{state.label}</span></div>
      <div className="flex justify-between gap-6"><span className="opacity-70">memory</span><span className="tabular-nums">{state.confidence.toFixed(2)}</span></div>
      <div className="mt-2 opacity-70">Shift sprints (loud). Walking is silent.</div>
    </div>
  );
}

function makeGuardProbe(): PlayableGame {
  const entityCatalog: Record<string, GameContextEntityEntry> = {
    [HERO]: { movement: { walkSpeed: 3 }, role: "player" },
    [GUARD]: { movement: { walkSpeed: 1.6 }, role: "npc" },
  };
  let context: GameContext | null = null;
  let senses: GuardSenses | null = null;
  let unregister: (() => void) | null = null;
  const readContext = (): GameContext | null => context;
  return {
    game: defineGameDefinition({
      name: "Guard probe",
      assets: createAssetCatalog(),
      multiplayer: null,
      inventories: {},
      input: {
        moveForward: ["KeyW"],
        moveBack: ["KeyS"],
        moveLeft: ["KeyA"],
        moveRight: ["KeyD"],
        sprint: ["ShiftLeft"],
        jump: ["Space"],
      },
    }),
    content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
    loop: {
      onInit: (ctx) => {
        context = ctx;
        unregister ??= registerGuardActions();
        senses = createGuardSenses();
        const [x, z] = GUARD_POSTS[0]!;
        ctx.scene.entity.spawn(GUARD, {
          id: GUARD_ID,
          position: [x, 0, z],
          role: "npc",
          behaviors: [{ kind: "decisionGraph", actions: GUARD_ACTIONS, graph: guardGraph, blackboard: guardBlackboard }],
        });
      },
      onNewPlayer: (ctx) => {
        context = ctx;
        ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: PLAYER_SPAWN, role: "player" });
      },
      onTick: (ctx, dt) => {
        senses?.tick(ctx, ctx.player.userId, dt);
      },
      onReset: () => {},
      onDispose: () => {
        unregister?.();
        unregister = null;
        senses = null;
        context = null;
      },
    },
    controls: { movement: { feel: { runMultiplier: 2.2 } } },
    rendering: { backdrop: { background: "#a9c8e6" } },
    scene: { environment: () => <Yard />, WorldOverlay: GuardOverlay },
    GameUI: () => <GuardPanel read={readContext} />,
    camera: {
      orbit: {
        initialDistance: 16,
        initialHeight: 14,
        minDistance: 6,
        maxDistance: 30,
        targetHeight: 1,
      },
    },
    capture: {
      probe: (): Record<string, number> => {
        const guard = context?.scene.entity.get(GUARD_ID);
        const board = context === null ? null : behaviorControl(context).blackboard(GUARD_ID);
        if (guard === null || guard === undefined || board === null) return {};
        const hero = context?.scene.entity.get(context.player.userId);
        return { playerX: hero?.position[0] ?? 0, playerZ: hero?.position[2] ?? 0, guardX: guard.position[0], guardZ: guard.position[2], alerted: board["alerted"] === true ? 1 : 0, confidence: Number(board["confidence"] ?? 0) };
      },
    },
  };
}

export const guardProbeGame: PlayableGame = makeGuardProbe();
