import { createRecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";
import { seededRng } from "@jgengine/core/random/rng";

import {
  BULLET_RADIUS,
  BULLET_RANGE,
  BULLET_SPEED,
  EXTRA_LIFE_EVERY,
  FIELD_H,
  FIELD_W,
  FIRE_COOLDOWN,
  HYPERSPACE_DEATH_CHANCE,
  INVULN_TIME,
  RECORD_KEY,
  RESPAWN_DELAY,
  ROCK_LARGE,
  ROCK_MEDIUM,
  ROCK_SMALL,
  SAFE_RADIUS,
  SAUCER_BIG_FIRE,
  SAUCER_BIG_RADIUS,
  SAUCER_BIG_SCORE,
  SAUCER_BULLET_RANGE,
  SAUCER_BULLET_SPEED,
  SAUCER_FIRST_DELAY,
  SAUCER_JINK,
  SAUCER_MAX_GAP,
  SAUCER_MIN_GAP,
  SAUCER_SMALL_FIRE,
  SAUCER_SMALL_RADIUS,
  SAUCER_SMALL_SCORE,
  SAUCER_SPEED,
  SHAKE_DECAY,
  SHAKE_ON_DEATH,
  SHIP_MAX_SPEED,
  SHIP_NOSE,
  SHIP_RADIUS,
  SHIP_THRUST,
  SHIP_TURN_RATE,
  START_LIVES,
  WAVE_CLEAR_DELAY,
} from "./constants";
import { TAU, applyThrust, circlesOverlapWrapped, headingX, headingY, speedOf, stepPosition, wrap } from "./geometry";
import {
  aimAngle,
  canFire,
  isBulletExpired,
  isCenterClear,
  makeBullet,
  makeRock,
  saucerAimSpread,
  scoreForRock,
  spawnWaveRocks,
  splitRock,
  type Bullet,
  type Controls,
  type Hazard,
  type Particle,
  type Phase,
  type Rock,
  type Saucer,
  type Ship,
  type SaucerKind,
} from "./logic";

const CX = FIELD_W / 2;
const CY = FIELD_H / 2;
const MAX_PARTICLES = 320;

export interface BlasterSnapshot {
  readonly phase: Phase;
  readonly ship: Ship | null;
  readonly bullets: readonly Bullet[];
  readonly rocks: readonly Rock[];
  readonly saucers: readonly Saucer[];
  readonly particles: readonly Particle[];
  readonly stars: readonly Star[];
  readonly score: number;
  readonly best: number;
  readonly lives: number;
  readonly wave: number;
  readonly shake: number;
  readonly newBest: boolean;
  readonly message: string | null;
}

export interface Star {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly a: number;
}

export interface BlasterStore {
  getState(): BlasterSnapshot;
  subscribe(listener: (s: BlasterSnapshot) => void): () => void;
  reset(): void;
  confirm(): void;
  togglePause(): void;
  restart(): void;
  hyperspace(): void;
  setTouch(name: keyof Controls, down: boolean): void;
  tick(dt: number, controls: Controls): void;
  preview(): void;
}

function resolveStorage(): RecordStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function makeStars(rng: () => number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < 90; i += 1) {
    stars.push({ x: rng() * FIELD_W, y: rng() * FIELD_H, r: 0.5 + rng() * 1.1, a: 0.2 + rng() * 0.5 });
  }
  return stars;
}

export function createBlasterStore(): BlasterStore {
  const listeners = new Set<(s: BlasterSnapshot) => void>();
  const records = createRecordBook<"score">({
    key: RECORD_KEY,
    fields: { score: "higher" },
    storage: resolveStorage(),
  });

  let runIndex = 0;
  let rng = seededRng(`rock-blaster-${runIndex}`);

  let phase: Phase = "start";
  let ship: Ship | null = null;
  let bullets: Bullet[] = [];
  let rocks: Rock[] = [];
  let saucers: Saucer[] = [];
  let particles: Particle[] = [];
  let stars: Star[] = makeStars(seededRng("rock-blaster-stars"));

  let score = 0;
  let lives = START_LIVES;
  let wave = 1;
  let shake = 0;
  let newBest = false;
  let message: string | null = null;
  let messageTimer = 0;

  let shipCooldown = 0;
  let respawnPending = false;
  let respawnTimer = 0;
  let saucerTimer = SAUCER_FIRST_DELAY;
  let waveClearTimer = -1;
  let nextExtraLife = EXTRA_LIFE_EVERY;
  let submitted = false;
  let bestOverride: number | null = null;

  const touch: { left: boolean; right: boolean; thrust: boolean; fire: boolean } = {
    left: false,
    right: false,
    thrust: false,
    fire: false,
  };

  function bestScore(): number {
    return bestOverride ?? records.bestOf("score") ?? 0;
  }

  function build(): BlasterSnapshot {
    return {
      phase,
      ship,
      bullets,
      rocks,
      saucers,
      particles,
      stars,
      score,
      best: bestScore(),
      lives,
      wave,
      shake,
      newBest,
      message,
    };
  }

  let snapshot = build();

  function emit(): void {
    snapshot = build();
    for (const listener of listeners) listener(snapshot);
  }

  function nextRng(): void {
    runIndex += 1;
    rng = seededRng(`rock-blaster-${runIndex}`);
  }

  function spawnShip(invuln: number): void {
    ship = { x: CX, y: CY, vx: 0, vy: 0, angle: 0, thrusting: false, invuln };
  }

  function hazards(): Hazard[] {
    const out: Hazard[] = [];
    for (const r of rocks) out.push({ x: r.x, y: r.y, radius: r.radius });
    for (const s of saucers) out.push({ x: s.x, y: s.y, radius: s.radius });
    return out;
  }

  function burst(x: number, y: number, count: number, spd: number, life: number): void {
    for (let i = 0; i < count; i += 1) {
      const a = rng() * TAU;
      const s = spd * (0.35 + rng() * 0.65);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, maxLife: life });
    }
    if (particles.length > MAX_PARTICLES) particles = particles.slice(particles.length - MAX_PARTICLES);
  }

  function setMessage(text: string, seconds: number): void {
    message = text;
    messageTimer = seconds;
  }

  function newGame(target: Phase): void {
    nextRng();
    score = 0;
    lives = START_LIVES;
    wave = 1;
    bullets = [];
    saucers = [];
    particles = [];
    rocks = spawnWaveRocks(wave, rng);
    shipCooldown = 0;
    saucerTimer = SAUCER_FIRST_DELAY;
    waveClearTimer = -1;
    nextExtraLife = EXTRA_LIFE_EVERY;
    submitted = false;
    newBest = false;
    bestOverride = null;
    shake = 0;
    message = null;
    messageTimer = 0;
    respawnPending = false;
    respawnTimer = 0;
    if (target === "playing") spawnShip(INVULN_TIME);
    else ship = null;
    phase = target;
  }

  function submitScore(): void {
    if (submitted) return;
    submitted = true;
    const result = records.submit({ score });
    newBest = result.improved.includes("score") && score > 0;
  }

  function killShip(): void {
    if (ship === null) return;
    burst(ship.x, ship.y, 22, 150, 0.9);
    shake = SHAKE_ON_DEATH;
    ship = null;
    lives -= 1;
    if (lives <= 0) {
      phase = "gameover";
      submitScore();
      setMessage("GAME OVER", 999);
    } else {
      respawnPending = true;
      respawnTimer = 0;
    }
  }

  function spawnSaucer(): void {
    const pSmall = Math.min(0.7, 0.22 + score / 55000);
    const kind: SaucerKind = rng() < pSmall ? "small" : "big";
    const fromLeft = rng() < 0.5;
    const radius = kind === "big" ? SAUCER_BIG_RADIUS : SAUCER_SMALL_RADIUS;
    saucers.push({
      x: fromLeft ? -radius : FIELD_W + radius,
      y: 40 + rng() * (FIELD_H - 80),
      vx: (fromLeft ? 1 : -1) * SAUCER_SPEED,
      vy: 0,
      kind,
      radius,
      fireTimer: kind === "big" ? SAUCER_BIG_FIRE : SAUCER_SMALL_FIRE,
      jinkTimer: SAUCER_JINK,
      life: 13,
    });
  }

  function saucerFire(s: Saucer): void {
    let angle: number;
    if (s.kind === "small" && ship !== null) {
      angle = aimAngle(s.x, s.y, ship.x, ship.y, saucerAimSpread(score), rng);
    } else {
      angle = rng() * TAU;
    }
    const gx = Math.cos(angle) * SAUCER_BULLET_SPEED;
    const gy = Math.sin(angle) * SAUCER_BULLET_SPEED;
    bullets.push({ x: s.x, y: s.y, vx: gx, vy: gy, dist: 0, range: SAUCER_BULLET_RANGE, friendly: false });
  }

  function fireShip(): void {
    if (ship === null) return;
    const nx = wrap(ship.x + headingX(ship.angle) * SHIP_NOSE, FIELD_W);
    const ny = wrap(ship.y + headingY(ship.angle) * SHIP_NOSE, FIELD_H);
    bullets.push(makeBullet(nx, ny, ship.angle, BULLET_SPEED, ship.vx, ship.vy, BULLET_RANGE, true));
    shipCooldown = FIRE_COOLDOWN;
    burst(nx, ny, 2, 40, 0.18);
  }

  function stepBodies(dt: number): void {
    for (const r of rocks) {
      const [x, y] = stepPosition(r.x, r.y, r.vx, r.vy, dt, FIELD_W, FIELD_H);
      r.x = x;
      r.y = y;
      r.angle += r.spin * dt;
    }
    const nextParticles: Particle[] = [];
    for (const p of particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x = wrap(p.x + p.vx * dt, FIELD_W);
      p.y = wrap(p.y + p.vy * dt, FIELD_H);
      nextParticles.push(p);
    }
    particles = nextParticles;
  }

  function stepBullets(dt: number): void {
    const kept: Bullet[] = [];
    for (const b of bullets) {
      const spd = speedOf(b.vx, b.vy);
      b.dist += spd * dt;
      const [x, y] = stepPosition(b.x, b.y, b.vx, b.vy, dt, FIELD_W, FIELD_H);
      b.x = x;
      b.y = y;
      if (!isBulletExpired(b)) kept.push(b);
    }
    bullets = kept;
  }

  function stepSaucers(dt: number): void {
    const kept: Saucer[] = [];
    for (const s of saucers) {
      s.life -= dt;
      if (s.life <= 0) continue;
      s.jinkTimer -= dt;
      if (s.jinkTimer <= 0) {
        s.vy = (rng() < 0.5 ? -1 : 1) * SAUCER_SPEED * (0.4 + rng() * 0.6);
        if (rng() < 0.4) s.vy = 0;
        s.jinkTimer = SAUCER_JINK;
      }
      s.x = wrap(s.x + s.vx * dt, FIELD_W);
      s.y = wrap(s.y + s.vy * dt, FIELD_H);
      s.fireTimer -= dt;
      if (s.fireTimer <= 0) {
        saucerFire(s);
        s.fireTimer = s.kind === "big" ? SAUCER_BIG_FIRE : SAUCER_SMALL_FIRE;
      }
      kept.push(s);
    }
    saucers = kept;
  }

  function collideBulletsRocks(): void {
    const keptBullets: Bullet[] = [];
    for (const b of bullets) {
      if (!b.friendly) {
        keptBullets.push(b);
        continue;
      }
      let hit = false;
      for (let i = 0; i < rocks.length; i += 1) {
        const r = rocks[i]!;
        if (circlesOverlapWrapped(b.x, b.y, BULLET_RADIUS, r.x, r.y, r.radius, FIELD_W, FIELD_H)) {
          score += scoreForRock(r.size);
          burst(r.x, r.y, r.size === ROCK_LARGE ? 14 : r.size === ROCK_MEDIUM ? 10 : 7, 120, 0.7);
          const children = splitRock(r, rng);
          rocks.splice(i, 1, ...children);
          hit = true;
          break;
        }
      }
      if (!hit) keptBullets.push(b);
    }
    bullets = keptBullets;
  }

  function collideBulletsSaucers(): void {
    const keptBullets: Bullet[] = [];
    for (const b of bullets) {
      if (!b.friendly) {
        keptBullets.push(b);
        continue;
      }
      let hit = false;
      for (let i = 0; i < saucers.length; i += 1) {
        const s = saucers[i]!;
        if (circlesOverlapWrapped(b.x, b.y, BULLET_RADIUS, s.x, s.y, s.radius, FIELD_W, FIELD_H)) {
          score += s.kind === "big" ? SAUCER_BIG_SCORE : SAUCER_SMALL_SCORE;
          burst(s.x, s.y, 16, 140, 0.8);
          saucers.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (!hit) keptBullets.push(b);
    }
    bullets = keptBullets;
  }

  function collideShip(): void {
    if (ship === null) return;
    const s = ship;
    if (s.invuln > 0) return;
    for (const r of rocks) {
      if (circlesOverlapWrapped(s.x, s.y, SHIP_RADIUS, r.x, r.y, r.radius, FIELD_W, FIELD_H)) {
        killShip();
        return;
      }
    }
    for (const uf of saucers) {
      if (circlesOverlapWrapped(s.x, s.y, SHIP_RADIUS, uf.x, uf.y, uf.radius, FIELD_W, FIELD_H)) {
        killShip();
        return;
      }
    }
    for (const b of bullets) {
      if (b.friendly) continue;
      if (circlesOverlapWrapped(s.x, s.y, SHIP_RADIUS, b.x, b.y, BULLET_RADIUS, FIELD_W, FIELD_H)) {
        killShip();
        return;
      }
    }
  }

  function controlShip(dt: number, c: Controls): void {
    if (ship === null) return;
    const s = ship;
    if (c.left) s.angle -= SHIP_TURN_RATE * dt;
    if (c.right) s.angle += SHIP_TURN_RATE * dt;
    s.thrusting = c.thrust;
    if (c.thrust) {
      const [vx, vy] = applyThrust(s.vx, s.vy, s.angle, SHIP_THRUST, dt, SHIP_MAX_SPEED);
      s.vx = vx;
      s.vy = vy;
      if (rng() < 0.6) {
        const bx = wrap(s.x - headingX(s.angle) * SHIP_NOSE, FIELD_W);
        const by = wrap(s.y - headingY(s.angle) * SHIP_NOSE, FIELD_H);
        particles.push({
          x: bx,
          y: by,
          vx: -headingX(s.angle) * 90 + (rng() - 0.5) * 40,
          vy: -headingY(s.angle) * 90 + (rng() - 0.5) * 40,
          life: 0.3,
          maxLife: 0.3,
        });
      }
    }
    const [x, y] = stepPosition(s.x, s.y, s.vx, s.vy, dt, FIELD_W, FIELD_H);
    s.x = x;
    s.y = y;
    s.invuln = Math.max(0, s.invuln - dt);
    shipCooldown = Math.max(0, shipCooldown - dt);
    if (c.fire && canFire(bullets.length, shipCooldown)) fireShip();
  }

  function tryRespawn(dt: number): void {
    if (!respawnPending) return;
    respawnTimer += dt;
    if (respawnTimer >= RESPAWN_DELAY && isCenterClear(hazards(), CX, CY, SAFE_RADIUS)) {
      spawnShip(INVULN_TIME);
      respawnPending = false;
    }
  }

  function checkExtraLife(): void {
    while (score >= nextExtraLife) {
      lives += 1;
      nextExtraLife += EXTRA_LIFE_EVERY;
      setMessage("EXTRA SHIP", 1.6);
    }
  }

  function checkWave(dt: number): void {
    if (rocks.length > 0) {
      waveClearTimer = -1;
      return;
    }
    if (waveClearTimer < 0) {
      waveClearTimer = WAVE_CLEAR_DELAY;
      return;
    }
    waveClearTimer -= dt;
    if (waveClearTimer <= 0) {
      wave += 1;
      rocks = spawnWaveRocks(wave, rng);
      saucers = [];
      saucerTimer = SAUCER_FIRST_DELAY;
      waveClearTimer = -1;
      setMessage(`WAVE ${wave}`, 1.4);
    }
  }

  function simulate(dt: number, c: Controls): void {
    checkExtraLife();
    controlShip(dt, c);
    tryRespawn(dt);
    stepBullets(dt);
    stepBodies(dt);
    saucerTimer -= dt;
    if (saucerTimer <= 0 && saucers.length === 0 && rocks.length > 0) {
      spawnSaucer();
      saucerTimer = SAUCER_MIN_GAP + rng() * (SAUCER_MAX_GAP - SAUCER_MIN_GAP);
    }
    stepSaucers(dt);
    collideBulletsRocks();
    collideBulletsSaucers();
    collideShip();
    checkWave(dt);
  }

  function driftAttract(dt: number): void {
    stepBodies(dt);
  }

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      newGame("start");
      phase = "start";
      ship = null;
      emit();
    },
    confirm() {
      if (phase === "start" || phase === "gameover") {
        newGame("playing");
      } else if (phase === "paused") {
        phase = "playing";
      } else {
        return;
      }
      emit();
    },
    togglePause() {
      if (phase === "playing") phase = "paused";
      else if (phase === "paused") phase = "playing";
      else return;
      emit();
    },
    restart() {
      newGame("playing");
      emit();
    },
    hyperspace() {
      if (phase !== "playing" || ship === null) return;
      const s = ship;
      s.x = rng() * FIELD_W;
      s.y = rng() * FIELD_H;
      s.vx = 0;
      s.vy = 0;
      burst(s.x, s.y, 10, 90, 0.5);
      if (rng() < HYPERSPACE_DEATH_CHANCE) killShip();
      emit();
    },
    setTouch(name, down) {
      touch[name] = down;
    },
    tick(dtRaw, controls) {
      const dt = Math.min(dtRaw, 1 / 30);
      if (dt <= 0) return;
      shake = Math.max(0, shake - SHAKE_DECAY * dt);
      if (messageTimer > 0) {
        messageTimer -= dt;
        if (messageTimer <= 0) message = null;
      }
      const c: Controls = {
        left: controls.left || touch.left,
        right: controls.right || touch.right,
        thrust: controls.thrust || touch.thrust,
        fire: controls.fire || touch.fire,
      };
      if (phase === "playing") simulate(dt, c);
      else driftAttract(dt);
      emit();
    },
    preview() {
      nextRng();
      phase = "playing";
      score = 4820;
      lives = 2;
      wave = 3;
      shake = 0;
      newBest = false;
      submitted = true;
      bestOverride = 12750;
      message = "WAVE 3";
      messageTimer = 1.2;
      respawnPending = false;
      saucerTimer = 6;
      waveClearTimer = -1;
      nextExtraLife = 10000;
      spawnShip(0);
      const s = ship;
      if (s !== null) {
        s.x = CX - 60;
        s.y = CY + 20;
        s.vx = 70;
        s.vy = -30;
        s.angle = TAU * 0.12;
        s.thrusting = true;
      }
      rocks = [
        makeRock(180, 150, ROCK_LARGE, rng),
        makeRock(620, 130, ROCK_MEDIUM, rng),
        makeRock(300, 430, ROCK_MEDIUM, rng),
        makeRock(540, 420, ROCK_SMALL, rng),
        makeRock(470, 250, ROCK_SMALL, rng),
        makeRock(120, 470, ROCK_SMALL, rng),
      ];
      saucers = [
        {
          x: 660,
          y: 320,
          vx: -SAUCER_SPEED,
          vy: 20,
          kind: "small",
          radius: SAUCER_SMALL_RADIUS,
          fireTimer: 0.6,
          jinkTimer: 0.8,
          life: 9,
        },
      ];
      bullets = [
        makeBullet(CX - 40, CY, TAU * 0.12, BULLET_SPEED, 70, -30, BULLET_RANGE, true),
        makeBullet(CX + 10, CY - 40, TAU * 0.12, BULLET_SPEED, 70, -30, BULLET_RANGE, true),
        { x: 640, y: 300, vx: -SAUCER_BULLET_SPEED, vy: 40, dist: 30, range: SAUCER_BULLET_RANGE, friendly: false },
      ];
      particles = [];
      burst(CX - 76, CY + 26, 6, 70, 0.3);
      emit();
    },
  };
}

export const blasterStore = createBlasterStore();
