/**
 * Live demo: the engine's leveling track over a save the page owns. A hero clears slimes; every kill calls
 * `grantXp`, which rolls surplus XP into the next level and calls back once per level reached. The chart
 * draws the curve the sliders define. Click the stage to land a kill yourself.
 */
import { leveling, type LevelingTrack } from "@jgengine/core/progression/leveling";

import { drawPill, mountCanvas2d, takeover } from "../canvas2d";
import type { Trace } from "../trace";

export interface XpDials {
  base: number;
  exponent: number;
  maxLevel: number;
  xpPerKill: number;
}

export interface XpSpecimen {
  setDials(dials: XpDials): void;
  dispose(): void;
}

interface Burst {
  text: string;
  born: number;
}

const SLIME_MS = 900;

export function createXpSpecimen(container: HTMLElement, trace: Trace): XpSpecimen {
  let dials: XpDials = { base: 80, exponent: 1.35, maxLevel: 20, xpPerKill: 60 };
  let track: LevelingTrack = makeTrack(dials);
  // The page's own save.
  const save = { xp: 0, level: 1 };
  const saveAccess = {
    get: (_id: string, stat: string) => (stat === "xp" ? { current: save.xp, max: 0 } : { current: save.level, max: dials.maxLevel }),
    set: (_id: string, stat: string, patch: { current?: number }) => {
      if (patch.current === undefined) return;
      if (stat === "xp") save.xp = patch.current;
      else save.level = patch.current;
    },
  };
  const bursts: Burst[] = [];
  const pilot = takeover(4000);
  let slimeBorn = performance.now();
  let swing = 0;
  let maxedAt = 0;

  function makeTrack(d: XpDials): LevelingTrack {
    return leveling({ xpForLevel: { kind: "power", base: d.base, exponent: d.exponent, round: "floor" }, maxLevel: d.maxLevel });
  }

  function kill() {
    trace.hit("kill");
    swing = performance.now();
    bursts.push({ text: `+${dials.xpPerKill} xp`, born: performance.now() });
    track.grantXp(saveAccess, "p1", dials.xpPerKill, (level) => {
      trace.hit("levelup");
      bursts.push({ text: `LEVEL ${level}`, born: performance.now() + 120 });
    });
    if (save.level >= dials.maxLevel && maxedAt === 0) maxedAt = performance.now();
  }

  const view = mountCanvas2d(container, ({ ctx, width, height }) => {
    const now = performance.now();
    trace.hit("curve");
    if (maxedAt !== 0 && now - maxedAt > 3500) {
      maxedAt = 0;
      save.xp = 0;
      save.level = 1;
      bursts.push({ text: "new character", born: now });
    }
    if (!pilot.byVisitor() && maxedAt === 0 && now - slimeBorn > SLIME_MS) {
      slimeBorn = now;
      kill();
    }

    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, width, height);
    const ground = height * 0.62;
    const heroX = width * 0.22;
    ctx.fillStyle = "#4ade80";
    ctx.beginPath();
    ctx.arc(heroX, ground - 18, 18, 0, Math.PI * 2);
    ctx.fill();
    const sw = Math.max(0, 1 - (now - swing) / 200);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(heroX + 14, ground - 24);
    ctx.lineTo(heroX + 14 + Math.cos(-1.2 + sw * 1.6) * 30, ground - 24 + Math.sin(-1.2 + sw * 1.6) * 30);
    ctx.stroke();
    // The next slime hops in from the right.
    if (maxedAt === 0) {
      const t = Math.min(1, (now - slimeBorn) / SLIME_MS);
      const sx = width * 0.62 - (width * 0.62 - heroX - 50) * t;
      ctx.fillStyle = "#a3e635";
      ctx.beginPath();
      ctx.ellipse(sx, ground - 9 - Math.abs(Math.sin(t * Math.PI * 3)) * 12, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const progress = track.resolve(save.level, save.xp);
    ctx.font = "bold 28px ui-sans-serif, system-ui";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "start";
    ctx.fillText(`Level ${save.level}`, 16, 64);
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(save.level >= dials.maxLevel ? "max level" : `${Math.round(save.xp)} / ${progress.xpMax} xp to level ${save.level + 1}`, 16, 82);
    const barW = width - 32;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(16, height - 30, barW, 10);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(16, height - 30, save.level >= dials.maxLevel ? barW : (barW * save.xp) / Math.max(1, progress.xpMax), 10);

    // The curve: XP each level costs.
    const chartX = width * 0.55, chartY = 46, chartW = width * 0.42, chartH = height * 0.36;
    let top = 1;
    for (let l = 1; l < dials.maxLevel; l++) top = Math.max(top, track.xpForLevel(l));
    const bw = chartW / Math.max(1, dials.maxLevel - 1);
    for (let l = 1; l < dials.maxLevel; l++) {
      const h = (track.xpForLevel(l) / top) * chartH;
      ctx.fillStyle = l === save.level ? "#facc15" : l < save.level ? "rgba(250,204,21,0.35)" : "rgba(255,255,255,0.18)";
      ctx.fillRect(chartX + (l - 1) * bw, chartY + chartH - h, Math.max(1, bw - 1), h);
    }
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(`xp per level, 1 to ${dials.maxLevel}`, chartX, chartY + chartH + 14);

    ctx.textAlign = "center";
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]!;
      const age = (now - b.born) / 1100;
      if (age > 1) {
        bursts.splice(i, 1);
        continue;
      }
      if (age < 0) continue;
      const big = b.text.startsWith("LEVEL") || b.text === "new character";
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = big ? "#facc15" : "#e2e8f0";
      ctx.font = big ? "bold 22px ui-sans-serif, system-ui" : "bold 13px ui-monospace, monospace";
      ctx.fillText(b.text, heroX + (big ? 0 : 40), ground - 50 - age * 40);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "start";
    drawPill(ctx, pilot.byVisitor() ? "Click to land a kill" : "Plays itself · click to land a kill", 12, 12, pilot.byVisitor() ? "live" : "accent");
  }, { label: "A hero gaining XP and levels through the engine's leveling track. Click to land a kill." });

  const onPointer = () => {
    pilot.touch();
    if (maxedAt === 0) {
      slimeBorn = performance.now();
      kill();
    }
  };
  view.canvas.addEventListener("pointerdown", onPointer);

  return {
    setDials(next) {
      dials = next;
      track = makeTrack(next);
      if (save.level > next.maxLevel) save.level = next.maxLevel;
    },
    dispose() {
      view.canvas.removeEventListener("pointerdown", onPointer);
      view.dispose();
    },
  };
}
