/**
 * Live demo: the engine's weapon system firing at a range, seen from the side. One `WeaponDefinition`
 * drives cadence, pellets, spread, magazine and ballistic flight; the sliders rebuild it and `retune`
 * the running weapon. A stick figure aims and fires on its own until the visitor moves the mouse over it.
 */
import { createDamageRuntime } from "@jgengine/core/combat/damage/damageRuntime";
import type { WeaponDefinition, WeaponVec3 } from "@jgengine/core/combat/weaponDefinition";
import { createWeaponSystem, type WeaponContact } from "@jgengine/core/combat/weaponSystem";

import { drawPill, mountCanvas2d, takeover } from "../canvas2d";
import type { Trace } from "../trace";

export interface ProjectileDials {
  kind: string;
  speed: number;
  gravity: number;
  pellets: number;
  rpm: number;
  size: number;
}

export interface ProjectilesSpecimen {
  setDials(dials: ProjectileDials): void;
  dispose(): void;
}

interface Target {
  id: string;
  z: number;
  y: number;
  r: number;
  hp: number;
  hitFlash: number;
  respawnAt: number;
}

interface Spark {
  z: number;
  y: number;
  vz: number;
  vy: number;
  life: number;
  color: string;
}

const RANGE = 60;
const MUZZLE: WeaponVec3 = [0, 1.45, 2.2];

function definitionFrom(d: ProjectileDials): WeaponDefinition {
  return {
    id: d.kind,
    roundsPerMinute: d.rpm,
    fireMode: "auto",
    pellets: Math.round(d.pellets),
    delivery: { kind: "projectile", speed: d.speed, gravity: d.gravity, lifetime: 4 },
    magazine: { capacity: 30, reloadMs: 1_200 },
    handling: { spread: { base: d.pellets > 1 ? 0.07 : 0.01, perShot: 0.004, max: d.pellets > 1 ? 0.12 : 0.06, recoverRate: 0.1 } },
    damage: { type: "kinetic", base: 20 },
    maxInFlight: 256,
  };
}

/** Launch angle that lands a shot `dz` ahead and `dy` up, lower arc first. */
function solvePitch(dz: number, dy: number, v: number, g: number): number {
  if (g < 0.05) return Math.atan2(dy, dz);
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * dz * dz + 2 * dy * v2);
  if (disc < 0) return Math.PI / 4;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * dz));
}

export function createProjectilesSpecimen(container: HTMLElement, trace: Trace): ProjectilesSpecimen {
  let dials: ProjectileDials = { kind: "rifle", speed: 70, gravity: 2, pellets: 1, rpm: 600, size: 1 };
  const damage = createDamageRuntime({
    table: { types: [{ id: "kinetic", vs: { flesh: 1 } }], armor: { halfValue: 100, maxMitigation: 0.9 } },
    zones: { zones: [{ id: "body", multiplier: 1 }], defaultZone: "body" },
    rng: Math.random,
  });
  const targets: Target[] = [
    { id: "near", z: 22, y: 0.9, r: 0.9, hp: 100, hitFlash: 0, respawnAt: 0 },
    { id: "far", z: 44, y: 0.9, r: 0.9, hp: 100, hitFlash: 0, respawnAt: 0 },
    { id: "balloon", z: 33, y: 9, r: 1.1, hp: 60, hitFlash: 0, respawnAt: 0 },
    { id: "tower", z: 54, y: 5, r: 1, hp: 100, hitFlash: 0, respawnAt: 0 },
  ];
  for (const t of targets) damage.registerTarget(t.id, { resistance: "flesh", armor: 0 });

  const sweep = (from: WeaponVec3, to: WeaponVec3): WeaponContact | null => {
    let best: WeaponContact | null = null;
    let bestF = Infinity;
    const dz = to[2] - from[2], dy = to[1] - from[1];
    const len2 = dz * dz + dy * dy || 1;
    for (const t of targets) {
      if (t.hp <= 0) continue;
      const f = Math.max(0, Math.min(1, ((t.z - from[2]) * dz + (t.y - from[1]) * dy) / len2));
      const pz = from[2] + dz * f, py = from[1] + dy * f;
      const reach = t.r + 0.15 * dials.size;
      if ((pz - t.z) ** 2 + (py - t.y) ** 2 <= reach * reach && f < bestF) {
        bestF = f;
        best = { target: t.id, point: [0, py, pz] };
      }
    }
    if (best === null && to[1] <= 0 && from[1] > 0) {
      const f = from[1] / (from[1] - to[1]);
      return { point: [0, 0, from[2] + dz * f] };
    }
    if (best === null && (to[2] > RANGE + 6 || to[1] < -1)) return { point: to };
    return best;
  };

  let weapon = createWeaponSystem(definitionFrom(dials), { rng: Math.random, damage, origin: () => MUZZLE, sweep, maxShotsPerTick: 8 });
  const sparks: Spark[] = [];
  const pilot = takeover(4000);
  let aimTarget = 0;
  let aimPitch = 0.1;
  let pointer: { z: number; y: number } | null = null;
  let mouseDown = false;
  let recoil = 0;
  let toWorld = (_px: number, _py: number) => ({ z: 0, y: 0 });

  const burst = (z: number, y: number, n: number, color: string, power: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.4 + Math.random()) * power;
      sparks.push({ z, y, vz: Math.cos(a) * s, vy: Math.sin(a) * s + power * 0.3, life: 0.5 + Math.random() * 0.4, color });
    }
    if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
  };

  const view = mountCanvas2d(container, ({ ctx, width, height, dt }) => {
    const now = performance.now();
    const visitor = pilot.byVisitor() && pointer !== null;
    for (const t of targets) {
      if (t.hp <= 0 && now >= t.respawnAt) t.hp = t.id === "balloon" ? 60 : 100;
      t.hitFlash = Math.max(0, t.hitFlash - dt * 4);
    }
    if (visitor && pointer !== null) {
      aimPitch = Math.atan2(pointer.y - MUZZLE[1], Math.max(0.5, pointer.z - MUZZLE[2]));
      weapon.setTrigger(mouseDown);
    } else {
      const alive = targets.filter((t) => t.hp > 0);
      const t = alive[aimTarget % Math.max(1, alive.length)];
      if (t !== undefined) {
        const want = solvePitch(t.z - MUZZLE[2], t.y - MUZZLE[1], dials.speed, dials.gravity);
        aimPitch += (want - aimPitch) * Math.min(1, dt * 8);
      }
      weapon.setTrigger(true);
    }
    weapon.setAim(0, aimPitch);
    trace.hit("aim");
    const result = weapon.tick(dt);
    if (result.shots.length > 0) {
      trace.hit("fire");
      recoil = 1;
    }
    if (weapon.pellets().length > 0) trace.hit("fly");
    if (weapon.ammo().reload !== "idle") trace.hit("reload");
    for (const hit of result.impacts) {
      trace.hit("hit");
      const t = targets.find((x) => x.id === hit.target);
      if (t === undefined) continue;
      t.hp -= hit.resolution.damage;
      t.hitFlash = 1;
      const big = dials.kind === "rocket";
      burst(t.z, t.y, big ? 30 : 8, big ? "#ffb347" : "#ffe08a", big ? 9 : 5);
      if (t.hp <= 0) {
        t.respawnAt = now + 1500;
        aimTarget += 1;
        burst(t.z, t.y, 24, "#ff7a1a", 7);
      }
    }
    recoil = Math.max(0, recoil - dt * 8);

    // Side view: metres to pixels, ground near the bottom.
    const scale = Math.min((width - 30) / (RANGE + 4), (height - 40) / 16);
    const ox = 20, oy = height - 28;
    const px = (z: number) => ox + z * scale;
    const py = (y: number) => oy - y * scale;
    toWorld = (x, y) => ({ z: (x - ox) / scale, y: (oy - y) / scale });

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#132033");
    sky.addColorStop(1, "#1d2c22");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#2b3a24";
    ctx.fillRect(0, oy, width, height - oy);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "10px ui-monospace, monospace";
    for (let m = 10; m <= RANGE; m += 10) ctx.fillText(`${m} m`, px(m) - 10, oy + 16);

    for (const t of targets) {
      if (t.hp <= 0) continue;
      const hit = t.hitFlash > 0;
      if (t.id === "balloon") {
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath(); ctx.moveTo(px(t.z), py(t.y - t.r)); ctx.lineTo(px(t.z), py(t.y - t.r - 2)); ctx.stroke();
      } else if (t.id === "tower") {
        ctx.fillStyle = "#3b4654";
        ctx.fillRect(px(t.z) - 0.4 * scale, py(t.y - t.r), 0.8 * scale, (t.y - t.r) * scale);
      }
      ctx.fillStyle = hit ? "#ffffff" : t.id === "balloon" ? "#e85d75" : "#d8c49a";
      ctx.beginPath(); ctx.arc(px(t.z), py(t.y), t.r * scale, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#7a2e1a";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px(t.z), py(t.y), t.r * scale * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(px(t.z) - 14, py(t.y + t.r) - 9, 28, 4);
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(px(t.z) - 14, py(t.y + t.r) - 9, 28 * Math.max(0, t.hp / (t.id === "balloon" ? 60 : 100)), 4);
    }

    // The shooter: a stick figure whose arm follows the aim.
    const hx = px(0.9), feet = oy;
    ctx.strokeStyle = "#f2f4f7";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const body = 1.45 * scale;
    ctx.beginPath();
    ctx.moveTo(hx, feet); ctx.lineTo(hx + 6, feet - body * 0.45);
    ctx.lineTo(hx + 12, feet);
    ctx.moveTo(hx + 6, feet - body * 0.45); ctx.lineTo(hx + 6, feet - body * 0.95);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(hx + 6, feet - body * 0.95 - 7, 6, 0, Math.PI * 2); ctx.stroke();
    const armLen = 1.5 * scale - recoil * 4;
    const sx = hx + 6, sy = feet - body * 0.8;
    ctx.strokeStyle = "#ff7a1a";
    ctx.lineWidth = 4 + dials.size;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(aimPitch) * armLen, sy - Math.sin(aimPitch) * armLen); ctx.stroke();

    for (const p of weapon.pellets()) {
      const [, y, z] = p.position;
      const [, vy, vz] = p.velocity;
      const x0 = px(z), y0 = py(y);
      const angle = Math.atan2(-vy, vz);
      const s = dials.size;
      if (dials.kind === "taco") {
        ctx.save();
        ctx.translate(x0, y0);
        ctx.rotate(p.age * 9);
        ctx.font = `${Math.round(12 * s)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🌮", 0, 0);
        ctx.restore();
      } else if (dials.kind === "rocket") {
        if (Math.random() < 0.6) sparks.push({ z, y, vz: -vz * 0.05, vy: 0.4, life: 0.6, color: "rgba(200,200,200,0.5)" });
        ctx.save();
        ctx.translate(x0, y0);
        ctx.rotate(angle);
        ctx.fillStyle = "#d9dde3";
        ctx.fillRect(-5 * s, -1.6 * s, 8 * s, 3.2 * s);
        ctx.fillStyle = "#ff5a3c";
        ctx.beginPath(); ctx.moveTo(3 * s, -1.6 * s); ctx.lineTo(6 * s, 0); ctx.lineTo(3 * s, 1.6 * s); ctx.fill();
        ctx.fillStyle = "#ffb347";
        ctx.beginPath(); ctx.arc(-5.5 * s, 0, 1.6 * s + Math.random() * s, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.strokeStyle = "#ffe08a";
        ctx.lineWidth = 1.5 * s;
        const tail = Math.min(14, Math.hypot(vz, vy) * 0.12) * s;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - Math.cos(angle) * tail, y0 - Math.sin(angle) * tail); ctx.stroke();
        ctx.fillStyle = "#fff6d0";
        ctx.beginPath(); ctx.arc(x0, y0, 1.6 * s, 0, Math.PI * 2); ctx.fill();
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      if (s === undefined) continue;
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy -= 9.8 * dt;
      s.z += s.vz * dt;
      s.y = Math.max(0, s.y + s.vy * dt);
      ctx.globalAlpha = Math.min(1, s.life * 2);
      ctx.fillStyle = s.color;
      ctx.fillRect(px(s.z) - 1.5, py(s.y) - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    const ammo = weapon.ammo();
    drawPill(ctx, visitor ? "You're aiming · hold the mouse to fire" : "Autopilot · move the mouse here to aim", 12, 12, visitor ? "live" : "accent");
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(ammo.reload !== "idle" ? "reloading…" : `${ammo.loaded} / ${ammo.capacity}`, width - 12, 24);
    ctx.fillText(`${weapon.pellets().length} in the air`, width - 12, 40);
    ctx.textAlign = "start";
  }, { label: "A stick figure firing at targets. Move the mouse over it to aim, hold to fire." });

  const onMove = (e: PointerEvent) => {
    const rect = view.canvas.getBoundingClientRect();
    pointer = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    pilot.touch();
  };
  const onDown = (e: PointerEvent) => { onMove(e); mouseDown = true; };
  const onUp = () => { mouseDown = false; };
  const onLeave = () => { pointer = null; mouseDown = false; };
  view.canvas.addEventListener("pointermove", onMove);
  view.canvas.addEventListener("pointerdown", onDown);
  view.canvas.addEventListener("pointerleave", onLeave);
  window.addEventListener("pointerup", onUp);

  return {
    setDials(next) {
      const kindChanged = next.kind !== dials.kind;
      dials = next;
      if (!weapon.retune(definitionFrom(dials)) || kindChanged) {
        weapon = createWeaponSystem(definitionFrom(dials), { rng: Math.random, damage, origin: () => MUZZLE, sweep, maxShotsPerTick: 8 });
      }
    },
    dispose() {
      view.canvas.removeEventListener("pointermove", onMove);
      view.canvas.removeEventListener("pointerdown", onDown);
      view.canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onUp);
      view.dispose();
    },
  };
}
