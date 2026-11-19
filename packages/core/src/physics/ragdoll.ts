import type { PhysicsWorld } from "./physicsWorld";

export interface RagdollBoneSpec {
  name: string;
  position: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
  mass?: number;
}

export interface RagdollLinkSpec {
  a: string;
  b: string;
  kind?: "hinge" | "distance";
  /** World point for a hinge pin. Defaults to the midpoint of the two bone centers. */
  anchor?: readonly [number, number, number];
}

export interface RagdollBalanceConfig {
  root: string;
  targetHeight: number;
  strength?: number;
  moveForce?: number;
}

export interface RagdollConfig {
  bones: RagdollBoneSpec[];
  links: RagdollLinkSpec[];
  balance?: RagdollBalanceConfig;
}

export class Ragdoll {
  readonly bones: Record<string, number>;
  readonly links: number[];
  private readonly world: PhysicsWorld;
  private readonly config?: RagdollBalanceConfig | undefined;

  constructor(world: PhysicsWorld, bones: Record<string, number>, links: number[], balance?: RagdollBalanceConfig) {
    this.world = world;
    this.bones = bones;
    this.links = links;
    this.config = balance;
  }

  centerOfMass(): [number, number, number] {
    const w = this.world;
    let mx = 0;
    let my = 0;
    let mz = 0;
    let total = 0;
    for (const id of Object.values(this.bones)) {
      const im = w.invMass[id]!;
      const m = im > 0 ? 1 / im : 0;
      mx += w.posX[id]! * m;
      my += w.posY[id]! * m;
      mz += w.posZ[id]! * m;
      total += m;
    }
    if (total === 0) return [0, 0, 0];
    return [mx / total, my / total, mz / total];
  }

  applyImpulse(bone: string, x: number, y: number, z: number): void {
    const w = this.world;
    const id = this.bones[bone];
    if (id === undefined) return;
    const im = w.invMass[id]!;
    w.velX[id]! += x * im;
    w.velY[id]! += y * im;
    w.velZ[id]! += z * im;
    w.wake(id);
  }

  balance(dt: number, moveX = 0, moveZ = 0): void {
    const c = this.config;
    if (c === undefined) return;
    const w = this.world;
    const id = this.bones[c.root];
    if (id === undefined) return;
    const strength = c.strength ?? 8;
    const moveForce = c.moveForce ?? 6;
    const err = c.targetHeight - w.posY[id]!;
    w.velY[id]! += err * strength * dt;
    w.velX[id]! += moveX * moveForce * dt;
    w.velZ[id]! += moveZ * moveForce * dt;
    w.wake(id);
  }

  remove(): void {
    for (const j of this.links) this.world.removeJoint(j);
    this.links.length = 0;
  }
}

export function createRagdoll(world: PhysicsWorld, config: RagdollConfig): Ragdoll {
  const bones: Record<string, number> = {};
  for (const spec of config.bones) {
    bones[spec.name] = world.addBody({
      position: spec.position,
      halfExtents: spec.halfExtents,
      mass: spec.mass ?? 1,
    });
  }
  const links: number[] = [];
  for (const link of config.links) {
    const a = bones[link.a];
    const b = bones[link.b];
    if (a === undefined || b === undefined) continue;
    if ((link.kind ?? "distance") === "hinge") {
      const mid: [number, number, number] =
        link.anchor !== undefined
          ? [link.anchor[0], link.anchor[1], link.anchor[2]]
          : [
              (world.posX[a]! + world.posX[b]!) / 2,
              (world.posY[a]! + world.posY[b]!) / 2,
              (world.posZ[a]! + world.posZ[b]!) / 2,
            ];
      links.push(
        world.fixedJoint({
          bodyA: a,
          bodyB: b,
          anchorA: [mid[0] - world.posX[a]!, mid[1] - world.posY[a]!, mid[2] - world.posZ[a]!],
          anchorB: [mid[0] - world.posX[b]!, mid[1] - world.posY[b]!, mid[2] - world.posZ[b]!],
        }),
      );
    } else {
      links.push(world.distanceJoint({ bodyA: a, bodyB: b }));
    }
  }
  return new Ragdoll(world, bones, links, config.balance);
}
