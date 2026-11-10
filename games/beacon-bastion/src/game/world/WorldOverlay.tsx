import { useMemo } from "@jgengine/core/ui/jsx";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
} from "three";
import { useGameContext } from "@jgengine/react/provider";
import { useGameStore } from "@jgengine/react/hooks";
import { SceneCaptureBinding } from "@jgengine/core/scene/sceneCapture.draw";
import { StaticShapeInstances } from "@jgengine/core/instancing/staticShapeInstances.draw";


import { buildCost, keep, towerStats } from "../keep";
import { session } from "../session";
import { activeProjectiles, type PendingProjectile } from "../combat/pendingProjectiles";
import { BUILD_PLOTS, FLANK_POINT_KEY, HAS_FLANK, ROUTES, SPAWN_POINT, groundHeightAt } from "./path";

/** Where the east flank road opens. */
const FLANK_GATE = ROUTES[FLANK_POINT_KEY]![0]!;
import { plotShapes } from "./plotShapes";
import { rangeRingBand } from "./rangeRing";
import { EngineDrawMount, SceneObjectGroup } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

function BuildPlots() {
  const gold = useGameStore((c) => keep.of(c).num("keep.gold"));
  const occupied = useGameStore((c) => BUILD_PLOTS.map((plot) => keep.of(c).occupant(plot.id) !== null).join(","));
  const selectedId = session.selectedTowerId;
  const cost = selectedId === null ? 0 : buildCost(selectedId);
  const affordable = selectedId !== null && gold >= cost;
  // Prepared stone foundations - an empty plot reads as masonry waiting for a tower - with a halo
  // coloured by whether the picked tower is affordable.
  const color = selectedId === null ? "#4a5a44" : affordable ? "#5fbf6a" : "#8a4a4a";
  const shapes = useMemo(() => plotShapes(BUILD_PLOTS, occupied.split(",").map((flag) => flag !== "true"), color), [occupied, color]);
  return <StaticShapeInstances instances={shapes} />;
}

/** A tower still rising: a timber frame that climbs with the keep's build order, so a timed build reads on the field. */
function buildSitesDraw(sites: readonly string[]): EngineDraw {
  const group = new Group();
  const unitBox = new BoxGeometry(1, 1, 1);
  const timber = new MeshStandardMaterial({ color: "#8a6a3e", roughness: 1 });
  const capMaterial = new MeshStandardMaterial({ color: "#a07a46", roughness: 1 });
  const posts: { plot: (typeof BUILD_PLOTS)[number]; height: number }[] = [];
  for (const site of sites) {
    const [slot, progressText] = site.split(":");
    const plot = BUILD_PLOTS.find((candidate) => candidate.id === slot);
    if (plot === undefined) continue;
    posts.push({ plot, height: 0.3 + 2.6 * Number(progressText) });
  }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      for (const { plot, height } of posts) {
        const site = new Group();
        site.position.set(plot.position[0], plot.position[1], plot.position[2]);
        for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) {
          const post = new Mesh(unitBox, timber);
          post.scale.set(0.18, height, 0.18);
          post.position.set(dx, height / 2, dz);
          post.castShadow = true;
          site.add(post);
        }
        const cap = new Mesh(unitBox, capMaterial);
        cap.scale.set(2.1, 0.14, 2.1);
        cap.position.y = height;
        cap.castShadow = true;
        site.add(cap);
        group.add(site);
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      unitBox.dispose();
      timber.dispose();
      capMaterial.dispose();
    },
  };
}

function BuildSites() {
  const sites = useGameStore((c) => {
    const world = keep.of(c);
    return world.orders("build").map((order) => `${world.instance(order.target ?? "")?.slot ?? ""}:${order.progress.toFixed(2)}`).join(",");
  });
  if (sites.length === 0) return null;
  return <EngineDrawMount create={() => buildSitesDraw(sites.split(","))} deps={[sites]} />;
}

/** The inspected tower's firing radius: a draped ground outline, so the raider road stays readable under it. */
function rangeRingDraw(center: readonly [number, number], radius: number): EngineDraw {
  const [x, z] = center;
  const geometry = new BufferGeometry();
  const band = rangeRingBand({ center: [x, z], radius, sampleHeight: groundHeightAt });
  geometry.setAttribute("position", new BufferAttribute(band.positions, 3));
  geometry.setIndex(new BufferAttribute(band.indices, 1));
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({
    color: "#f4d35e",
    emissive: "#f4d35e",
    emissiveIntensity: 0.6,
    roughness: 0.5,
    transparent: true,
    opacity: 0.85,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 4;
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

function RangeRing({ center, radius }: { center: readonly [number, number]; radius: number }) {
  return <EngineDrawMount create={() => rangeRingDraw(center, radius)} deps={[center[0], center[1], radius]} />;
}

/** The selection ring's flat gold band under the inspected tower. */
function inspectionRingDraw(): EngineDraw {
  const geometry = new RingGeometry(1.5, 1.75, 32);
  const material = new MeshStandardMaterial({ color: "#f4d35e", emissive: "#f4d35e", emissiveIntensity: 0.8, roughness: 0.5 });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.33;
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

/** Selection ring plus the live firing radius of the tower whose sell/upgrade panel is open. */
function InspectedTower() {
  const inspectedId = useGameStore(() => session.inspectedTowerId);
  const slot = useGameStore((c) => (inspectedId === null ? null : keep.of(c).instance(inspectedId)?.slot ?? null));
  const range = useGameStore((c) => (inspectedId === null ? 0 : towerStats(keep.of(c), inspectedId).range));
  const plot = slot === null ? undefined : BUILD_PLOTS.find((candidate) => candidate.id === slot);
  if (plot === undefined) return null;
  return (
    <>
      <SceneObjectGroup position={[plot.position[0], plot.position[1], plot.position[2]]}>
        <EngineDrawMount create={inspectionRingDraw} deps={[]} />
      </SceneObjectGroup>
      <RangeRing center={[plot.position[0], plot.position[2]]} radius={range} />
    </>
  );
}

/** Raider gate landmark at a spawn — two rough stone pillars and a dark banner mark where the horde emerges. */
function spawnGateDraw(at: readonly [number, number, number], facing: number): EngineDraw {
  const [x, y, z] = at;
  const group = new Group();
  group.position.set(x, y, z);
  group.rotation.y = facing;
  const unitBox = new BoxGeometry(1, 1, 1);
  const unitSphere = new SphereGeometry(1, 10, 8);
  const unitPlane = new PlaneGeometry(1, 1);
  const stone = new MeshStandardMaterial({ color: "#565049", roughness: 1 });
  const lintelMaterial = new MeshStandardMaterial({ color: "#463f39", roughness: 1 });
  const banner = new MeshStandardMaterial({ color: "#7a2320", roughness: 0.6, side: DoubleSide });
  const flame = new MeshStandardMaterial({ color: "#ff8b3a", emissive: "#ff5a1e", emissiveIntensity: 1.4, roughness: 0.4 });
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      for (const dx of [-1.5, 1.5]) {
        const pillar = new Mesh(unitBox, stone);
        pillar.scale.set(0.7, 2.2, 0.7);
        pillar.position.set(dx, 1.1, 0);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        group.add(pillar);
      }
      const top = new Mesh(unitBox, lintelMaterial);
      top.scale.set(4, 0.5, 0.6);
      top.position.set(0, 2.45, 0);
      top.castShadow = true;
      group.add(top);
      const cloth = new Mesh(unitPlane, banner);
      cloth.scale.set(1.5, 1.3, 1);
      cloth.position.set(0, 1.75, 0.02);
      group.add(cloth);
      for (const dx of [-1.5, 1.5]) {
        const brazier = new Mesh(unitSphere, flame);
        brazier.scale.setScalar(0.22);
        brazier.position.set(dx, 2.35, 0);
        group.add(brazier);
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      unitBox.dispose();
      unitSphere.dispose();
      unitPlane.dispose();
      stone.dispose();
      lintelMaterial.dispose();
      banner.dispose();
      flame.dispose();
    },
  };
}

function SpawnGate({ at, facing = 0 }: { at: readonly [number, number, number]; facing?: number }) {
  return <EngineDrawMount create={() => spawnGateDraw(at, facing)} deps={[at[0], at[1], at[2], facing]} />;
}

function boltPosition(bolt: PendingProjectile, now: number): [number, number, number] {
  const t = Math.min(1, (now - bolt.spawnedAt) / bolt.travelSeconds);
  return [
    bolt.from[0] + (bolt.to[0] - bolt.from[0]) * t,
    bolt.from[1] + 0.9 + (bolt.to[1] - bolt.from[1]) * t,
    bolt.from[2] + (bolt.to[2] - bolt.from[2]) * t,
  ];
}

/** Bolts in flight: one draw owns a mesh per live bolt and moves them every frame without a render. */
function projectileBoltsDraw(ctx: GameContext): EngineDraw {
  const group = new Group();
  const geometry = new SphereGeometry(0.14, 8, 8);
  const materials = new Map<string, MeshStandardMaterial>();
  const bolts = new Map<string, Mesh>();
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame() {
      const now = ctx.time.now();
      const seen = new Set<string>();
      for (const bolt of activeProjectiles(now)) {
        seen.add(bolt.id);
        let mesh = bolts.get(bolt.id);
        if (mesh === undefined) {
          let material = materials.get(bolt.color);
          if (material === undefined) {
            material = new MeshStandardMaterial({ color: bolt.color, emissive: bolt.color, emissiveIntensity: 0.9 });
            materials.set(bolt.color, material);
          }
          mesh = new Mesh(geometry, material);
          group.add(mesh);
          bolts.set(bolt.id, mesh);
        }
        const [bx, by, bz] = boltPosition(bolt, now);
        mesh.position.set(bx, by, bz);
      }
      for (const [id, mesh] of bolts) {
        if (seen.has(id)) continue;
        group.remove(mesh);
        bolts.delete(id);
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      bolts.clear();
      geometry.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}

/** Bolts in flight: the draw reads the live list each frame, so firing and landing never re-render. */
function ProjectileBolts() {
  const ctx = useGameContext();
  return <EngineDrawMount create={() => projectileBoltsDraw(ctx)} deps={[ctx]} />;
}

/** VFX-only overlay — the authored scene (draped creep path + instanced foliage) is auto-mounted
 * by `defineGame({ editorLayers })`. */
export function BeaconBastionWorldOverlay() {
  return (
    <>
      <SceneCaptureBinding />
      <SpawnGate at={SPAWN_POINT} />
      {HAS_FLANK ? <SpawnGate at={FLANK_GATE} facing={Math.PI / 2} /> : null}
      <BuildPlots />
      <BuildSites />
      <InspectedTower />
      <ProjectileBolts />
    </>
  );
}

