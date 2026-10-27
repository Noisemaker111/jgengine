/**
 * Live demo: the engine's stat pool over state the page owns. A hero takes hits and drinks potions; every
 * change goes through `applyStatPoolDelta` and a two-method adapter, and the floating numbers show what
 * was really applied after clamping. Click the stage to throw a hit yourself.
 */
import { applyStatPoolDelta, createStatPool, type StatPool } from "@jgengine/core/stats/statPool";

import { drawPill, mountCanvas2d, takeover } from "../canvas2d";
import type { Trace } from "../trace";

export interface HealthDials {
  maxHealth: number;
  hitSize: number;
  potionSize: number;
}

export interface HealthSpecimen {
  setDials(dials: HealthDials): void;
  dispose(): void;
}

interface Popup {
  text: string;
  color: string;
  born: number;
}

interface Bolt {
  from: number;
  born: number;
}

const BOLT_MS = 500;

export function createHealthSpecimen(container: HTMLElement, trace: Trace): HealthSpecimen {
  let dials: HealthDials = { maxHealth: 100, hitSize: 12, potionSize: 20 };
  // The page's own state, shaped however it likes.
  const pools: Record<string, Record<string, StatPool>> = { hero: { health: createStatPool({ current: 100, max: 100 }) } };
  const access = {
    get: (id: string, stat: string) => {
      trace.hit("get");
      return pools[id]?.[stat] ?? null;
    },
    set: (id: string, stat: string, next: StatPool) => {
      trace.hit("set");
      pools[id]![stat] = next;
    },
  };
  const popups: Popup[] = [];
  const bolts: Bolt[] = [];
  const pilot = takeover(4000);
  let nextHit = performance.now() + 700;
  let nextPotion = performance.now() + 4200;
  let downUntil = 0;
  let potionAt: number | null = null;
  let flash = 0;

  function hit() {
    trace.hit("hit");
    const r = applyStatPoolDelta(access, "hero", "health", -dials.hitSize);
    if (r.status !== "ok") return;
    flash = performance.now();
    popups.push({ text: `${r.applied}${r.applied !== -dials.hitSize ? ` (asked ${-dials.hitSize})` : ""}`, color: "#ff8a70", born: performance.now() });
    if (r.hitMin) {
      popups.push({ text: "hit 0", color: "#fca5a5", born: performance.now() + 150 });
      downUntil = performance.now() + 1600;
    }
  }

  function potion() {
    trace.hit("potion");
    const r = applyStatPoolDelta(access, "hero", "health", dials.potionSize);
    if (r.status !== "ok") return;
    popups.push({ text: `+${r.applied}${r.hitMax ? " (full)" : ""}`, color: "#86efac", born: performance.now() });
  }

  const view = mountCanvas2d(container, ({ ctx, width, height }) => {
    const now = performance.now();
    const pool = pools.hero!.health!;
    if (downUntil !== 0 && now > downUntil) {
      downUntil = 0;
      pools.hero!.health = createStatPool({ current: dials.maxHealth, max: dials.maxHealth });
      popups.push({ text: "back up", color: "#e2e8f0", born: now });
    }
    if (downUntil === 0 && !pilot.byVisitor()) {
      if (now > nextHit) {
        bolts.push({ from: Math.random() < 0.5 ? -1 : 1, born: now });
        nextHit = now + 900 + Math.random() * 700;
      }
      if (now > nextPotion) {
        potionAt = now;
        nextPotion = now + 3800 + Math.random() * 1500;
      }
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      if (now - bolts[i]!.born >= BOLT_MS) {
        bolts.splice(i, 1);
        if (downUntil === 0) hit();
      }
    }
    if (potionAt !== null && now - potionAt > 900) {
      potionAt = null;
      if (downUntil === 0) potion();
    }

    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, width, height);
    const cx = width / 2, cy = height * 0.55;
    // Enemies on both sides throw bolts at the hero.
    for (const side of [-1, 1]) {
      const ex = cx + side * Math.min(width * 0.36, 220);
      ctx.fillStyle = "#f87171";
      ctx.beginPath();
      ctx.arc(ex, cy, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of bolts) {
      const t = (now - b.born) / BOLT_MS;
      const ex = cx + b.from * Math.min(width * 0.36, 220);
      ctx.fillStyle = "#ffb27a";
      ctx.beginPath();
      ctx.arc(ex + (cx - ex) * t, cy - Math.sin(t * Math.PI) * 30, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (potionAt !== null) {
      const t = (now - potionAt) / 900;
      ctx.font = "20px serif";
      ctx.textAlign = "center";
      ctx.fillText("🧪", cx + 60 - t * 60, cy - 40 + t * 30);
    }
    // The hero.
    const down = downUntil !== 0;
    ctx.fillStyle = now - flash < 120 ? "#ffffff" : down ? "#475569" : "#4ade80";
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    // Health bar from the pool.
    const barW = Math.min(260, width * 0.6);
    const frac = pool.max > 0 ? (pool.current - pool.min) / (pool.max - pool.min) : 0;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(cx - barW / 2, cy - 52, barW, 10);
    ctx.fillStyle = frac > 0.5 ? "#4ade80" : frac > 0.2 ? "#facc15" : "#f87171";
    ctx.fillRect(cx - barW / 2, cy - 52, barW * frac, 10);
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`${Math.round(pool.current)} / ${pool.max}`, cx, cy - 60);
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i]!;
      const age = (now - p.born) / 1100;
      if (age > 1) {
        popups.splice(i, 1);
        continue;
      }
      if (age < 0) continue;
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = p.color;
      ctx.font = "bold 14px ui-monospace, monospace";
      ctx.fillText(p.text, cx + (i % 2 === 0 ? 34 : -34), cy - 24 - age * 40);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "start";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(`pools.hero.health = { current: ${Math.round(pool.current)}, max: ${pool.max}, min: ${pool.min} }`, 12, height - 14);
    drawPill(ctx, pilot.byVisitor() ? "Click to hit the hero" : "Plays itself · click to hit the hero", 12, 12, pilot.byVisitor() ? "live" : "accent");
  }, { label: "A hero taking hits and drinking potions through the engine's health pool. Click to hit." });

  const onPointer = () => {
    pilot.touch();
    if (downUntil === 0) bolts.push({ from: Math.random() < 0.5 ? -1 : 1, born: performance.now() });
  };
  view.canvas.addEventListener("pointerdown", onPointer);

  return {
    setDials(next) {
      const maxChanged = next.maxHealth !== dials.maxHealth;
      dials = next;
      if (maxChanged) {
        const pool = pools.hero!.health!;
        pools.hero!.health = createStatPool({ current: Math.min(pool.current, next.maxHealth), max: next.maxHealth });
      }
    },
    dispose() {
      view.canvas.removeEventListener("pointerdown", onPointer);
      view.dispose();
    },
  };
}
