export interface PhysicsBounds {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

export interface PhysicsWorldConfig {
  /** Maximum bodies the SoA buffers can hold. Fixed at construction; no reallocation later. */
  capacity: number;
  /** AABB container; every body is constrained inside it (floor included). */
  bounds: PhysicsBounds;
  /** Downward acceleration applied to awake bodies each substep. Default -20. */
  gravity?: number;
  /** Broadphase cell edge; tune to ≈ small-body diameter. Default 1. */
  cellSize?: number;
  /** Fixed substep length in seconds. Default 1/60. */
  fixedDt?: number;
  /** Cap on substeps per `step()` — bounds catch-up work, drops the rest. Default 4. */
  maxSubsteps?: number;
  /** Bounce factor on contacts and walls, 0..1. Default 0.2. */
  restitution?: number;
  /** Approach speed below which restitution is ignored (contacts rest instead of jittering). Default 1. */
  restitutionThreshold?: number;
  /** Coulomb friction coefficient on contacts and the floor, 0..1. Default 0.4. */
  friction?: number;
  /** Per-second linear velocity damping (physical energy bleed so piles settle and sleep). Default 0.2. */
  linearDamping?: number;
  /** Sequential-impulse velocity iterations per substep (higher = more stable stacks). Default 4. */
  solverIterations?: number;
  /** Baumgarte positional-correction fraction per substep, 0..1. Default 0.2. */
  correctionFactor?: number;
  /** Penetration tolerated before correction kicks in. Default 0.005. */
  slop?: number;
  /** Speed at or below which a body counts as still. Default 0.08. */
  sleepLinearVelocity?: number;
  /** Consecutive still substeps before a body sleeps. Default 30. */
  sleepThresholdSteps?: number;
  /** Approach speed a contact must exceed to wake a sleeping body (resting contacts don't). Default 0.5. */
  wakeThreshold?: number;
}

export interface PhysicsStats {
  count: number;
  awake: number;
  sleeping: number;
  contacts: number;
  pairs: number;
  substeps: number;
  stepMs: number;
}

export interface AddBodyOptions {
  position: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
  velocity?: readonly [number, number, number];
  /** ≤ 0 or omitted with `static` → infinite mass (immovable collider). Default 1. */
  mass?: number;
  /** Immovable collider: never integrates, never sleeps-out, invMass 0. */
  static?: boolean;
  /** Seed the body asleep (a settled bed pays no integration cost until woken). */
  asleep?: boolean;
}

const FLAG_SLEEPING = 1;
const FLAG_STATIC = 2;

/** Grid cell containing a point, clamped into the grid. Pure — exported for tests. */
export function cellCoord(value: number, min: number, cellSize: number, cells: number): number {
  const raw = Math.floor((value - min) / cellSize);
  return raw < 0 ? 0 : raw >= cells ? cells - 1 : raw;
}

/** Linear cell index from clamped 3D coords. Pure — exported for tests. */
export function cellIndex(cx: number, cy: number, cz: number, nx: number, ny: number): number {
  return (cz * ny + cy) * nx + cx;
}

export class PhysicsWorld {
  readonly capacity: number;
  readonly bounds: PhysicsBounds;
  readonly gravity: number;
  readonly cellSize: number;
  readonly fixedDt: number;
  readonly maxSubsteps: number;
  readonly restitution: number;
  readonly restitutionThreshold: number;
  readonly friction: number;
  readonly linearDamping: number;
  readonly solverIterations: number;
  readonly correctionFactor: number;
  readonly slop: number;
  readonly sleepMove2: number;
  readonly sleepSteps: number;
  readonly wakeThreshold: number;

  readonly posX: Float32Array;
  readonly posY: Float32Array;
  readonly posZ: Float32Array;
  readonly velX: Float32Array;
  readonly velY: Float32Array;
  readonly velZ: Float32Array;
  readonly halfX: Float32Array;
  readonly halfY: Float32Array;
  readonly halfZ: Float32Array;
  readonly invMass: Float32Array;
  readonly flags: Uint8Array;
  /** 1 for a body that took part in a contact this frame; reset each `step()`. Render tint reads this. */
  readonly contact: Uint8Array;

  private readonly sleepTimer: Uint16Array;
  private readonly prevX: Float32Array;
  private readonly prevY: Float32Array;
  private readonly prevZ: Float32Array;
  private readonly nx: number;
  private readonly ny: number;
  private readonly nz: number;
  private readonly numCells: number;
  private readonly cellStart: Int32Array;
  private readonly cursor: Int32Array;
  private readonly sorted: Int32Array;
  private readonly bodyCell: Int32Array;

  // Awake-body index: the hot loops (integrate, solver outer, bounds, sleep) walk only these,
  // so per-substep work outside the grid rebuild scales with the awake count, not the total.
  private readonly awakeList: Int32Array;
  private readonly awakeSlot: Int32Array;
  private awakeCount = 0;

  private bodyCount = 0;
  private accumulator = 0;
  private readonly stats: PhysicsStats = {
    count: 0,
    awake: 0,
    sleeping: 0,
    contacts: 0,
    pairs: 0,
    substeps: 0,
    stepMs: 0,
  };

  constructor(config: PhysicsWorldConfig) {
    this.capacity = config.capacity;
    this.bounds = { min: config.bounds.min, max: config.bounds.max };
    this.gravity = config.gravity ?? -20;
    this.cellSize = config.cellSize ?? 1;
    this.fixedDt = config.fixedDt ?? 1 / 60;
    this.maxSubsteps = config.maxSubsteps ?? 4;
    this.restitution = config.restitution ?? 0.2;
    this.restitutionThreshold = config.restitutionThreshold ?? 1;
    this.friction = config.friction ?? 0.4;
    this.linearDamping = config.linearDamping ?? 0.2;
    this.solverIterations = Math.max(1, config.solverIterations ?? 4);
    this.correctionFactor = config.correctionFactor ?? 0.2;
    this.slop = config.slop ?? 0.005;
    const sleepV = config.sleepLinearVelocity ?? 0.08;
    const sleepMoveEps = sleepV * this.fixedDt;
    this.sleepMove2 = sleepMoveEps * sleepMoveEps;
    this.sleepSteps = config.sleepThresholdSteps ?? 30;
    this.wakeThreshold = config.wakeThreshold ?? 0.5;

    const cap = config.capacity;
    this.posX = new Float32Array(cap);
    this.posY = new Float32Array(cap);
    this.posZ = new Float32Array(cap);
    this.velX = new Float32Array(cap);
    this.velY = new Float32Array(cap);
    this.velZ = new Float32Array(cap);
    this.halfX = new Float32Array(cap);
    this.halfY = new Float32Array(cap);
    this.halfZ = new Float32Array(cap);
    this.invMass = new Float32Array(cap);
    this.flags = new Uint8Array(cap);
    this.contact = new Uint8Array(cap);
    this.sleepTimer = new Uint16Array(cap);
    this.prevX = new Float32Array(cap);
    this.prevY = new Float32Array(cap);
    this.prevZ = new Float32Array(cap);

    const span = (i: number) => Math.max(config.bounds.max[i] - config.bounds.min[i], this.cellSize);
    this.nx = Math.max(1, Math.ceil(span(0) / this.cellSize));
    this.ny = Math.max(1, Math.ceil(span(1) / this.cellSize));
    this.nz = Math.max(1, Math.ceil(span(2) / this.cellSize));
    this.numCells = this.nx * this.ny * this.nz;
    this.cellStart = new Int32Array(this.numCells + 1);
    this.cursor = new Int32Array(this.numCells);
    this.sorted = new Int32Array(cap);
    this.bodyCell = new Int32Array(cap);
    this.awakeList = new Int32Array(cap);
    this.awakeSlot = new Int32Array(cap).fill(-1);
  }

  private addAwake(i: number): void {
    if (this.awakeSlot[i]! >= 0) return;
    this.awakeSlot[i] = this.awakeCount;
    this.awakeList[this.awakeCount] = i;
    this.awakeCount += 1;
  }

  private removeAwake(i: number): void {
    const slot = this.awakeSlot[i]!;
    if (slot < 0) return;
    this.awakeCount -= 1;
    const last = this.awakeList[this.awakeCount]!;
    this.awakeList[slot] = last;
    this.awakeSlot[last] = slot;
    this.awakeSlot[i] = -1;
  }

  get count(): number {
    return this.bodyCount;
  }

  get cells(): { nx: number; ny: number; nz: number; total: number } {
    return { nx: this.nx, ny: this.ny, nz: this.nz, total: this.numCells };
  }

  addBody(options: AddBodyOptions): number {
    if (this.bodyCount >= this.capacity) throw new Error("PhysicsWorld: capacity exceeded");
    const i = this.bodyCount++;
    this.posX[i] = options.position[0];
    this.posY[i] = options.position[1];
    this.posZ[i] = options.position[2];
    const v = options.velocity;
    this.velX[i] = v?.[0] ?? 0;
    this.velY[i] = v?.[1] ?? 0;
    this.velZ[i] = v?.[2] ?? 0;
    this.halfX[i] = options.halfExtents[0];
    this.halfY[i] = options.halfExtents[1];
    this.halfZ[i] = options.halfExtents[2];
    const isStatic = options.static === true;
    const mass = options.mass ?? 1;
    this.invMass[i] = isStatic || mass <= 0 ? 0 : 1 / mass;
    let f = 0;
    if (isStatic) f |= FLAG_STATIC | FLAG_SLEEPING;
    else if (options.asleep === true) f |= FLAG_SLEEPING;
    this.flags[i] = f;
    this.sleepTimer[i] = 0;
    this.awakeSlot[i] = -1;
    this.bodyCell[i] = this.cellOf(i);
    if ((f & FLAG_SLEEPING) === 0) this.addAwake(i);
    return i;
  }

  isSleeping(i: number): boolean {
    return (this.flags[i]! & FLAG_SLEEPING) !== 0;
  }

  wake(i: number): void {
    if ((this.flags[i]! & FLAG_STATIC) !== 0) return;
    this.flags[i]! &= ~FLAG_SLEEPING;
    this.sleepTimer[i] = 0;
    this.prevX[i] = this.posX[i]!;
    this.prevY[i] = this.posY[i]!;
    this.prevZ[i] = this.posZ[i]!;
    this.addAwake(i);
  }

  wakeAll(): void {
    for (let i = 0; i < this.bodyCount; i += 1) {
      if ((this.flags[i]! & FLAG_STATIC) === 0) {
        this.flags[i]! &= ~FLAG_SLEEPING;
        this.sleepTimer[i] = 0;
        this.addAwake(i);
      }
    }
  }

  clear(): void {
    this.bodyCount = 0;
    this.accumulator = 0;
    this.awakeCount = 0;
  }

  /** Advance by a real frame delta; runs whole fixed substeps and carries the remainder. */
  step(frameDt: number): PhysicsStats {
    const start = performanceNow();
    this.accumulator += frameDt;
    const cap = this.maxSubsteps * this.fixedDt;
    if (this.accumulator > cap) this.accumulator = cap;
    let substeps = 0;
    this.stats.contacts = 0;
    this.stats.pairs = 0;
    this.contact.fill(0, 0, this.bodyCount);
    while (this.accumulator >= this.fixedDt) {
      this.substep(this.fixedDt);
      this.accumulator -= this.fixedDt;
      substeps += 1;
    }
    this.stats.count = this.bodyCount;
    this.stats.awake = this.awakeCount;
    this.stats.sleeping = this.bodyCount - this.awakeCount;
    this.stats.substeps = substeps;
    this.stats.stepMs = performanceNow() - start;
    return this.stats;
  }

  getStats(): PhysicsStats {
    return this.stats;
  }

  private substep(dt: number): void {
    const gdt = this.gravity * dt;
    const damp = this.linearDamping > 0 ? Math.max(0, 1 - this.linearDamping * dt) : 1;
    const awakeBefore = this.awakeCount;
    for (let a = 0; a < awakeBefore; a += 1) {
      const i = this.awakeList[a]!;
      this.prevX[i] = this.posX[i]!;
      this.prevY[i] = this.posY[i]!;
      this.prevZ[i] = this.posZ[i]!;
      this.velY[i]! += gdt;
      if (damp !== 1) {
        this.velX[i]! *= damp;
        this.velY[i]! *= damp;
        this.velZ[i]! *= damp;
      }
      this.posX[i]! += this.velX[i]! * dt;
      this.posY[i]! += this.velY[i]! * dt;
      this.posZ[i]! += this.velZ[i]! * dt;
      this.constrainBounds(i);
    }
    this.buildGrid();
    const iterations = this.solverIterations;
    for (let it = 0; it < iterations; it += 1) this.solve(it === 0, it === iterations - 1);
    for (let a = 0; a < this.awakeCount; a += 1) this.constrainBounds(this.awakeList[a]!);
    this.updateSleep();
  }

  private constrainBounds(i: number): void {
    const min = this.bounds.min;
    const max = this.bounds.max;
    const e = this.restitution;
    const rt = this.restitutionThreshold;
    const loX = min[0] + this.halfX[i]!;
    const hiX = max[0] - this.halfX[i]!;
    const loY = min[1] + this.halfY[i]!;
    const hiY = max[1] - this.halfY[i]!;
    const loZ = min[2] + this.halfZ[i]!;
    const hiZ = max[2] - this.halfZ[i]!;
    if (this.posX[i]! < loX) {
      this.posX[i] = loX;
      if (this.velX[i]! < 0) this.velX[i]! = -this.velX[i]! < rt ? 0 : this.velX[i]! * -e;
    } else if (this.posX[i]! > hiX) {
      this.posX[i] = hiX;
      if (this.velX[i]! > 0) this.velX[i]! = this.velX[i]! < rt ? 0 : -this.velX[i]! * e;
    }
    if (this.posZ[i]! < loZ) {
      this.posZ[i] = loZ;
      if (this.velZ[i]! < 0) this.velZ[i]! = -this.velZ[i]! < rt ? 0 : this.velZ[i]! * -e;
    } else if (this.posZ[i]! > hiZ) {
      this.posZ[i] = hiZ;
      if (this.velZ[i]! > 0) this.velZ[i]! = this.velZ[i]! < rt ? 0 : -this.velZ[i]! * e;
    }
    if (this.posY[i]! < loY) {
      this.posY[i] = loY;
      if (this.velY[i]! < 0) this.velY[i]! = -this.velY[i]! < rt ? 0 : this.velY[i]! * -e;
      const tf = 1 - this.friction;
      this.velX[i]! *= tf;
      this.velZ[i]! *= tf;
    } else if (this.posY[i]! > hiY) {
      this.posY[i] = hiY;
      if (this.velY[i]! > 0) this.velY[i]! = this.velY[i]! < rt ? 0 : -this.velY[i]! * e;
    }
  }

  private buildGrid(): void {
    const n = this.bodyCount;
    const start = this.cellStart;
    start.fill(0);
    // Sleeping bodies never move, so their cell index is cached from addBody / their last awake
    // substep — only awake bodies pay the cell recomputation each substep.
    const awakeCount = this.awakeCount;
    for (let a = 0; a < awakeCount; a += 1) {
      const i = this.awakeList[a]!;
      this.bodyCell[i] = this.cellOf(i);
    }
    for (let i = 0; i < n; i += 1) start[this.bodyCell[i]! + 1]! += 1;
    for (let c = 0; c < this.numCells; c += 1) {
      start[c + 1]! += start[c]!;
      this.cursor[c] = start[c]!;
    }
    for (let i = 0; i < n; i += 1) {
      const c = this.bodyCell[i]!;
      this.sorted[this.cursor[c]!++] = i;
    }
  }

  private cellOf(i: number): number {
    const cx = cellCoord(this.posX[i]!, this.bounds.min[0], this.cellSize, this.nx);
    const cy = cellCoord(this.posY[i]!, this.bounds.min[1], this.cellSize, this.ny);
    const cz = cellCoord(this.posZ[i]!, this.bounds.min[2], this.cellSize, this.nz);
    return cellIndex(cx, cy, cz, this.nx, this.ny);
  }

  private solve(restitutionPass: boolean, countPass: boolean): void {
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;
    const nxny = nx * ny;
    // A contact may wake a sleeping body mid-pass, appending it to the awake list; re-read the
    // count each iteration so it is solved this substep too.
    for (let a = 0; a < this.awakeCount; a += 1) {
      const i = this.awakeList[a]!;
      const c = this.bodyCell[i]!;
      const cz = (c / nxny) | 0;
      const cy = ((c - cz * nxny) / nx) | 0;
      const cx = c - cz * nxny - cy * nx;
      const z0 = cz > 0 ? cz - 1 : cz;
      const z1 = cz < nz - 1 ? cz + 1 : cz;
      const y0 = cy > 0 ? cy - 1 : cy;
      const y1 = cy < ny - 1 ? cy + 1 : cy;
      const x0 = cx > 0 ? cx - 1 : cx;
      const x1 = cx < nx - 1 ? cx + 1 : cx;
      for (let z = z0; z <= z1; z += 1) {
        for (let y = y0; y <= y1; y += 1) {
          const rowBase = (z * ny + y) * nx;
          for (let x = x0; x <= x1; x += 1) {
            const cell = rowBase + x;
            const end = this.cellStart[cell + 1]!;
            for (let s = this.cellStart[cell]!; s < end; s += 1) {
              const j = this.sorted[s]!;
              if (j === i) continue;
              const jSleeping = (this.flags[j]! & FLAG_SLEEPING) !== 0;
              if (!jSleeping && j < i) continue;
              this.resolve(i, j, restitutionPass, countPass);
            }
          }
        }
      }
    }
  }

  private resolve(i: number, j: number, restitutionPass: boolean, countPass: boolean): void {
    const dx = this.posX[j]! - this.posX[i]!;
    const px = this.halfX[i]! + this.halfX[j]! - Math.abs(dx);
    if (px <= 0) return;
    const dy = this.posY[j]! - this.posY[i]!;
    const py = this.halfY[i]! + this.halfY[j]! - Math.abs(dy);
    if (py <= 0) return;
    const dz = this.posZ[j]! - this.posZ[i]!;
    const pz = this.halfZ[i]! + this.halfZ[j]! - Math.abs(dz);
    if (pz <= 0) return;

    if (countPass) {
      this.stats.pairs += 1;
      this.stats.contacts += 1;
      this.contact[i] = 1;
      this.contact[j] = 1;
    }
    let nX = 0;
    let nY = 0;
    let nZ = 0;
    let pen: number;
    if (px <= py && px <= pz) {
      nX = dx < 0 ? -1 : 1;
      pen = px;
    } else if (py <= pz) {
      nY = dy < 0 ? -1 : 1;
      pen = py;
    } else {
      nZ = dz < 0 ? -1 : 1;
      pen = pz;
    }

    const rvx = this.velX[j]! - this.velX[i]!;
    const rvy = this.velY[j]! - this.velY[i]!;
    const rvz = this.velZ[j]! - this.velZ[i]!;
    const rvn = rvx * nX + rvy * nY + rvz * nZ;

    const imI = this.invMass[i]!;
    let imJ = this.invMass[j]!;
    // A sleeping neighbor only wakes on a genuine impact; a resting contact treats it as a
    // static collider (imJ = 0) so a settled body can rest on the bed without stirring it awake.
    if ((this.flags[j]! & FLAG_SLEEPING) !== 0) {
      if (-rvn > this.wakeThreshold) this.wake(j);
      else imJ = 0;
    }
    const imSum = imI + imJ;
    if (imSum === 0) return;

    if (rvn < 0) {
      const e = restitutionPass && -rvn > this.restitutionThreshold ? this.restitution : 0;
      const jn = (-(1 + e) * rvn) / imSum;
      this.velX[i]! -= jn * imI * nX;
      this.velY[i]! -= jn * imI * nY;
      this.velZ[i]! -= jn * imI * nZ;
      this.velX[j]! += jn * imJ * nX;
      this.velY[j]! += jn * imJ * nY;
      this.velZ[j]! += jn * imJ * nZ;

      let tx = rvx - rvn * nX;
      let ty = rvy - rvn * nY;
      let tz = rvz - rvn * nZ;
      const tlen = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (tlen > 1e-6) {
        tx /= tlen;
        ty /= tlen;
        tz /= tlen;
        let jt = -(rvx * tx + rvy * ty + rvz * tz) / imSum;
        const maxF = this.friction * jn;
        if (jt > maxF) jt = maxF;
        else if (jt < -maxF) jt = -maxF;
        this.velX[i]! -= jt * imI * tx;
        this.velY[i]! -= jt * imI * ty;
        this.velZ[i]! -= jt * imI * tz;
        this.velX[j]! += jt * imJ * tx;
        this.velY[j]! += jt * imJ * ty;
        this.velZ[j]! += jt * imJ * tz;
      }
    }

    const corr = (Math.max(pen - this.slop, 0) / imSum) * this.correctionFactor;
    this.posX[i]! -= corr * imI * nX;
    this.posY[i]! -= corr * imI * nY;
    this.posZ[i]! -= corr * imI * nZ;
    this.posX[j]! += corr * imJ * nX;
    this.posY[j]! += corr * imJ * nY;
    this.posZ[j]! += corr * imJ * nZ;
  }

  private updateSleep(): void {
    // A body sleeps when it has actually stopped moving — measured by displacement over
    // the substep, not instantaneous velocity, which can stay "stuck" nonzero on a body
    // pinned between contacts even while its position is at rest.
    const moveEps2 = this.sleepMove2;
    let a = 0;
    while (a < this.awakeCount) {
      const i = this.awakeList[a]!;
      const dx = this.posX[i]! - this.prevX[i]!;
      const dy = this.posY[i]! - this.prevY[i]!;
      const dz = this.posZ[i]! - this.prevZ[i]!;
      if (dx * dx + dy * dy + dz * dz <= moveEps2) {
        const t = this.sleepTimer[i]! + 1;
        if (t >= this.sleepSteps) {
          this.flags[i]! |= FLAG_SLEEPING;
          this.velX[i] = 0;
          this.velY[i] = 0;
          this.velZ[i] = 0;
          this.sleepTimer[i] = 0;
          this.removeAwake(i);
          continue;
        }
        this.sleepTimer[i] = t;
      } else {
        this.sleepTimer[i] = 0;
      }
      a += 1;
    }
  }
}

function performanceNow(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf !== undefined ? perf.now() : 0;
}
