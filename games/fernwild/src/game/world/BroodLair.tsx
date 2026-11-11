/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, type ReactNode } from "@jgengine/core/ui/jsx";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { LightBeam } from "@jgengine/core/map/LightBeam.draw";
import { EngineDrawMount, SceneObjectGroup } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useGameStore } from "@jgengine/react/hooks";

import * as THREE from "three";

import { broodView, greenObelisk, lairWall, spitInFlight } from "../broodmother";
import { PORTAL_RANGE } from "../data/bosses";

const GREEN = "#34ff6a";
const ACID = "#9dff3a";

/** The lair's wall as mossy rock, and webs hung across its top — one draw for every slab. */
function lairWallDraw(slabs: ReturnType<typeof lairWall>): EngineDraw {
  const group = new THREE.Group();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const rock = [0, 1, 2].map((index) => new THREE.MeshStandardMaterial({ color: index === 0 ? "#4d5040" : index === 1 ? "#55574a" : "#464838", roughness: 0.95 }));
  const web = new THREE.MeshStandardMaterial({ color: "#3f6b2c", roughness: 1 });
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      slabs.forEach((slab, index) => {
        const holder = new THREE.Group();
        holder.position.set(slab.center[0], slab.center[1], slab.center[2]);
        holder.rotation.y = slab.rotationY ?? 0;
        const [hx, hy, hz] = slab.halfExtents;
        const body = new THREE.Mesh(unitBox, rock[index % 3]!);
        body.scale.set(hx * 2, hy * 2, hz * 2);
        body.castShadow = true;
        body.receiveShadow = true;
        const cap = new THREE.Mesh(unitBox, web);
        cap.scale.set(hx * 2 + 0.2, 1.2, hz * 2 + 0.4);
        cap.position.y = hy - 0.6;
        holder.add(body, cap);
        group.add(holder);
      });
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      unitBox.dispose();
      for (const material of [...rock, web]) material.dispose();
    },
  };
}

function LairWall({ ctx }: WorldOverlayProps): ReactNode {
  const slabs = useMemo(() => lairWall(ctx), [ctx]);
  return <EngineDrawMount create={() => lairWallDraw(slabs)} deps={[slabs]} />;
}

/** The acid in flight: a glowing green glob arcing from her to where you stood. */
function spitDraw(ctx: WorldOverlayProps["ctx"]): EngineDraw {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(0.7, 12, 8);
  const material = new THREE.MeshStandardMaterial({ color: ACID, emissive: ACID, emissiveIntensity: 2, toneMapped: false });
  const glob = new THREE.Mesh(geometry, material);
  glob.visible = false;
  group.add(glob);
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame() {
      const at = spitInFlight(ctx);
      glob.visible = at !== null;
      if (at !== null) glob.position.set(at[0], at[1], at[2]);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}

function Spit({ ctx }: WorldOverlayProps): ReactNode {
  return <EngineDrawMount create={() => spitDraw(ctx)} deps={[ctx]} />;
}

/** The portal's reach ring on the obelisk's foot. */
function portalRingDraw(): EngineDraw {
  const geometry = new THREE.RingGeometry(PORTAL_RANGE - 0.8, PORTAL_RANGE, 64);
  const material = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.7, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.3;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}

/** While the portal counts down, the obelisk's foot glows: a green beam and a ring as wide as it reaches. */
function Portal({ ctx }: WorldOverlayProps): ReactNode {
  const phase = useGameStore((state) => broodView(state).phase);
  const at = useMemo(() => greenObelisk(ctx), [ctx]);
  if (phase !== "portal") return null;
  return (
    <SceneObjectGroup position={[at[0], at[1], at[2]]}>
      <LightBeam height={120} radius={3} color={GREEN} opacity={0.5} />
      <EngineDrawMount create={portalRingDraw} deps={[]} />
    </SceneObjectGroup>
  );
}

/** What the Broodmother adds to the world: her walled lair, the portal at the obelisk, and her acid in the air. */
export function BroodLair({ ctx }: WorldOverlayProps): ReactNode {
  return (
    <>
      <LairWall ctx={ctx} />
      <Portal ctx={ctx} />
      <Spit ctx={ctx} />
    </>
  );
}
