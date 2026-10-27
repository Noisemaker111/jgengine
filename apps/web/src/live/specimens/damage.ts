/**
 * Live demo: the engine's damage resolver. A turret shoots a plain grunt and an armored knight in turn;
 * each shot goes through `resolveDamageHit` with the armor matchup, and the result drains the target's
 * health pool through the same adapter as the health demo. Click a target to shoot it yourself.
 */
import { resolveDamageHit } from "@jgengine/core/combat/damage/damageResolution";
import { applyStatPoolDelta, createStatPool, type StatPool } from "@jgengine/core/stats/statPool";

import { drawPill, mountCanvas2d, takeover } from "../canvas2d";
import type { Trace } from "../trace";

export interface DamageDials {
  impact: number;
  armorFactor: number;
}

export interface DamageSpecimen {
  setDials(dials: DamageDials): void;
  dispose(): void;
}

interface Target {
  id: "grunt" | "knight";
  armored: boolean;
  /** Fraction of the stage height. */
  y: number;
}

interface Shot {
  target: Target;
  born: number;
}

interface Popup {
  target: Target;
  text: string;
  born: number;
}

const GRUNT: Target = { id: "grunt", armored: false, y: 0.33 };
const KNIGHT: Target = { id: "knight", armored: true, y: 0.72 };
const TARGETS: readonly Target[] = [GRUNT, KNIGHT];
const SHOT_MS = 380;
const MAX_HP = 120;

export function createDamageSpecimen(container: HTMLElement, trace: Trace): DamageSpecimen {
  let dials: DamageDials = { impact: 24, armorFactor: 0.5 };
  const health = new Map<string, StatPool>(TARGETS.map((t) => [t.id, createStatPool({ max: MAX_HP })]));
  const access = {
    get: (id: string, stat: string) => (stat === "health" ? (health.get(id) ?? null) : null),
    set: (id: string, stat: string, next: StatPool) => {
      if (stat === "health") health.set(id, next);
    },
  };
  const shots: Shot[] = [];
  const popups: Popup[] = [];
  const pilot = takeover(4000);
  let turn = 0;
  let nextShot = performance.now() + 500;
  let layout = { turretX: 0, targetX: 0, height: 1 };

  function land(target: Target) {
    trace.hit("shot");
    if (target.armored) trace.hit("armored");
    const result = resolveDamageHit({
      channel: "kinetic",
      impact: dials.impact,
      target: target.id,
      targetTraits: target.armored ? ["armored"] : [],
      matchup: { entries: { kinetic: { armored: { impact: dials.armorFactor } } } },
    });
    trace.hit("drain");
    applyStatPoolDelta(access, target.id, "health", -result.impact);
    popups.push({ target, text: `-${Math.round(result.impact * 10) / 10}`, born: performance.now() });
    const pool = health.get(target.id);
    if (pool !== undefined && pool.current <= pool.min) health.set(target.id, createStatPool({ max: MAX_HP }));
  }

  const view = mountCanvas2d(container, ({ ctx, width, height }) => {
    const now = performance.now();
    if (!pilot.byVisitor() && now > nextShot) {
      shots.push({ target: turn % 2 === 0 ? GRUNT : KNIGHT, born: now });
      turn += 1;
      nextShot = now + 650;
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (s !== undefined && now - s.born >= SHOT_MS) {
        shots.splice(i, 1);
        land(s.target);
      }
    }

    layout = { turretX: Math.max(40, width * 0.14), targetX: width * 0.68, height };
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, width, height);
    const ty = height * 0.52;
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(layout.turretX - 16, ty - 14, 32, 28);
    ctx.fillRect(layout.turretX, ty - 4, 26, 8);
    for (const s of shots) {
      const t = (now - s.born) / SHOT_MS;
      const tyEnd = height * s.target.y;
      ctx.fillStyle = "#ffb27a";
      ctx.beginPath();
      ctx.arc(layout.turretX + 26 + (layout.targetX - layout.turretX - 26) * t, ty + (tyEnd - ty) * t, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = "12px ui-monospace, monospace";
    for (const target of TARGETS) {
      const y = height * target.y;
      const pool = health.get(target.id);
      if (pool === undefined) continue;
      ctx.fillStyle = target.armored ? "#93c5fd" : "#f87171";
      ctx.beginPath();
      ctx.arc(layout.targetX, y, 16, 0, Math.PI * 2);
      ctx.fill();
      if (target.armored) {
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(layout.targetX, y, 21, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
      const barW = 90;
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(layout.targetX + 30, y - 4, barW, 8);
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(layout.targetX + 30, y - 4, (barW * pool.current) / pool.max, 8);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.textAlign = "start";
      ctx.fillText(target.armored ? `knight · armored × ${dials.armorFactor}` : "grunt · no armor", layout.targetX + 30, y - 12);
    }
    ctx.textAlign = "center";
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      if (p === undefined) continue;
      const age = (now - p.born) / 900;
      if (age > 1) {
        popups.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = p.target.armored ? "#bfdbfe" : "#ff8a70";
      ctx.font = "bold 15px ui-monospace, monospace";
      ctx.fillText(p.text, layout.targetX, height * p.target.y - 24 - age * 30);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "start";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(`impact ${dials.impact} → grunt takes ${dials.impact}, knight takes ${Math.round(dials.impact * dials.armorFactor * 10) / 10}`, 12, height - 14);
    drawPill(ctx, pilot.byVisitor() ? "Click a target to shoot it" : "Plays itself · click a target to shoot it", 12, 12, pilot.byVisitor() ? "live" : "accent");
  }, { label: "A turret shooting a plain and an armored target through the engine's damage resolver. Click a target to shoot." });

  const onPointer = (e: PointerEvent) => {
    const rect = view.canvas.getBoundingClientRect();
    const y = (e.clientY - rect.top) / layout.height;
    const target = Math.abs(y - GRUNT.y) < Math.abs(y - KNIGHT.y) ? GRUNT : KNIGHT;
    pilot.touch();
    shots.push({ target, born: performance.now() });
  };
  view.canvas.addEventListener("pointerdown", onPointer);

  return {
    setDials(next) {
      dials = next;
    },
    dispose() {
      view.canvas.removeEventListener("pointerdown", onPointer);
      view.dispose();
    },
  };
}
