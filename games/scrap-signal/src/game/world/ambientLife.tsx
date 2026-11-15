/** @jsxImportSource @jgengine/core/ui/jsx */
import { CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from "three";
import { normalizeEditorLayers, type EditorDocument, type EditorLayersInput } from "@jgengine/core/editor/index";
import { useGameContext } from "@jgengine/ui/provider";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import sceneJson from "../../editor.scene.json";
import { buildAppliance } from "./applianceModel";

/**
 * The suburb between fights, drawn: impact sprinklers sweeping water arcs over the front lawns, and a
 * couple of stray delivery drones circling high overhead with nowhere to deliver. Pure scenery: no
 * collision, no AI, nothing to shoot. Sprinklers stand a few metres inside each other house's lawn
 * from its mailbox (the yard props authored in the scene).
 */
const sceneDoc: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);

interface SprinklerSite {
  x: number;
  z: number;
  /** Centre heading of its sweep. */
  heading: number;
  phase: number;
}

/** Every other house's lawn gets a sprinkler, set back from the mailbox into the yard. */
export const SPRINKLER_SITES: readonly SprinklerSite[] = sceneDoc.markers
  .filter((marker) => (marker.meta as { catalogId?: string } | undefined)?.catalogId === "mailbox")
  .filter((_, index) => index % 2 === 0)
  .map((marker, index) => {
    const yaw = marker.rotationY ?? 0;
    // Back toward the house from the mailbox, and a little to the side: the middle of the front lawn.
    const inX = -Math.sin(yaw) * 2.6 - Math.cos(yaw) * 1.8;
    const inZ = -Math.cos(yaw) * 2.6 + Math.sin(yaw) * 1.8;
    return { x: marker.position.x + inX, z: marker.position.z + inZ, heading: yaw, phase: index * 1.7 };
  });

const DROPS = 22;
const SWEEP = 1.1;
const RANGE = 4.2;
const DRAW_RADIUS = 80;
const DRONES = 2;

function ambientDraw(ctx: GameContext): EngineDraw {
  const root = new Group();
  const dropGeometry = new SphereGeometry(0.06, 6, 4);
  const dropMaterial = new MeshStandardMaterial({ color: "#bfe9ff", emissive: "#7fd0ff", emissiveIntensity: 0.6, transparent: true, opacity: 0.75, roughness: 0.1 });
  const drops = new InstancedMesh(dropGeometry, dropMaterial, SPRINKLER_SITES.length * DROPS);
  drops.frustumCulled = false;
  root.add(drops);
  const headGeometry = new CylinderGeometry(0.06, 0.09, 0.3, 8);
  const headMaterial = new MeshStandardMaterial({ color: "#2e9e4f", roughness: 0.5 });
  const heads = SPRINKLER_SITES.map((site) => {
    const head = new Mesh(headGeometry, headMaterial);
    head.position.set(site.x, ctx.world.groundHeightAt(site.x, site.z) + 0.15, site.z);
    root.add(head);
    return head;
  });
  const grounds = SPRINKLER_SITES.map((site) => ctx.world.groundHeightAt(site.x, site.z));
  const drones = Array.from({ length: DRONES }, (_, index) => {
    const build = buildAppliance("drone", { body: index === 0 ? "#ffd84a" : "#f2f2ee", elite: false });
    const holder = new Group();
    holder.scale.setScalar(0.8);
    holder.add(build.root);
    root.add(holder);
    return { build, holder, orbit: 22 + index * 9, speed: 0.18 + index * 0.07, height: 14 + index * 5, phase: index * 2.4 };
  });
  const matrix = new Matrix4();
  const hidden = new Matrix4().makeScale(0, 0, 0);
  const camera = new Vector3();
  const centre = new Vector3();
  let centreSet = false;
  return {
    mount(state: EngineFrameState) {
      state.scene.add(root);
    },
    frame(state: EngineFrameState, dt: number) {
      const t = state.clock.elapsedTime;
      camera.copy(state.camera.position);
      SPRINKLER_SITES.forEach((site, index) => {
        const near = Math.hypot(site.x - camera.x, site.z - camera.z) < DRAW_RADIUS;
        heads[index]!.visible = near;
        // Impact sprinklers sweep back and forth across the lawn and throw a fan of droplets.
        const sweep = site.heading + Math.PI + Math.sin(t * 0.5 + site.phase) * SWEEP;
        for (let drop = 0; drop < DROPS; drop += 1) {
          const slot = index * DROPS + drop;
          if (!near) {
            drops.setMatrixAt(slot, hidden);
            continue;
          }
          const life = (t * 1.3 + drop / DROPS) % 1;
          const reach = RANGE * life;
          const lift = 0.25 + 1.6 * life * (1 - life) * 2.2;
          const spread = (drop % 3 - 1) * 0.08;
          matrix.makeTranslation(
            site.x + Math.sin(sweep + spread) * reach,
            grounds[index]! + lift,
            site.z + Math.cos(sweep + spread) * reach,
          );
          drops.setMatrixAt(slot, matrix);
        }
      });
      drops.instanceMatrix.needsUpdate = true;
      // The stray drones circle a point that drifts after the player, high and slow.
      if (!centreSet) {
        centre.copy(camera);
        centreSet = true;
      }
      centre.lerp(camera, Math.min(1, dt * 0.05));
      for (const drone of drones) {
        const angle = t * drone.speed + drone.phase;
        const x = centre.x + Math.cos(angle) * drone.orbit;
        const z = centre.z + Math.sin(angle) * drone.orbit;
        drone.holder.position.set(x, ctx.world.groundHeightAt(x, z) + drone.height + Math.sin(t * 0.7 + drone.phase) * 0.6, z);
        drone.holder.rotation.y = -angle;
        drone.build.animate(t, true);
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(root);
      root.clear();
      dropGeometry.dispose();
      dropMaterial.dispose();
      headGeometry.dispose();
      headMaterial.dispose();
      drops.dispose();
      for (const drone of drones) drone.build.dispose();
    },
  };
}

/** Sprinklers and stray drones, mounted with the world overlay. */
export function SuburbLife() {
  const ctx = useGameContext();
  return <EngineDrawMount create={() => ambientDraw(ctx)} deps={[ctx]} />;
}
