/**
 * Live demo: the engine's `Minimap` over a plain array the page owns. Units wander a field drawn on a
 * canvas; every frame they are mapped to markers and handed to the real minimap component in the corner.
 * The hero walks on its own until the visitor clicks somewhere to send it there.
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { Minimap } from "@jgengine/core/map/map.view";
import { DEFAULT_MARKER_KINDS } from "@jgengine/core/map/markers";

import { drawPill, mountCanvas2d, takeover } from "../canvas2d";
import type { Trace } from "../trace";

export interface MinimapDials {
  worldRadius: number;
  units: number;
  rotate: boolean;
}

export interface MinimapSpecimen {
  setDials(dials: MinimapDials): void;
  dispose(): void;
}

type Team = "ally" | "enemy" | "loot";
interface Unit {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  team: Team;
}

const FIELD_W = 200;
const FIELD_D = 120;
const TEAMS: readonly Team[] = ["enemy", "ally", "enemy", "loot"];
const MAP_SIZE = 150;

export function createMinimapSpecimen(container: HTMLElement, trace: Trace): MinimapSpecimen {
  let dials: MinimapDials = { worldRadius: 60, units: 14, rotate: false };
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const units: Unit[] = [];
  const hero = { x: 0, z: 0, yaw: 0 };
  let goal = { x: 40, z: 20 };
  let clickGoal: { x: number; z: number } | null = null;
  const pilot = takeover(6000);
  let lastMap = 0;
  let scale = 1;
  let originX = 0;
  let originY = 0;

  function fillUnits(count: number) {
    while (units.length > count) units.pop();
    while (units.length < count) {
      const i = units.length;
      units.push({
        id: `u${i}`,
        x: (rand() - 0.5) * FIELD_W,
        z: (rand() - 0.5) * FIELD_D,
        vx: (rand() - 0.5) * 6,
        vz: (rand() - 0.5) * 6,
        team: TEAMS[i % TEAMS.length]!,
      });
    }
  }
  fillUnits(dials.units);

  const panel = document.createElement("div");
  panel.style.cssText = `position:absolute;top:10px;right:10px;width:${MAP_SIZE}px;pointer-events:none;`;
  const root = createRoot(panel);

  const view = mountCanvas2d(container, ({ ctx, width, height, dt }) => {
    for (const u of units) {
      if (u.team === "loot") continue;
      u.x += u.vx * dt;
      u.z += u.vz * dt;
      if (Math.abs(u.x) > FIELD_W / 2) u.vx *= -1;
      if (Math.abs(u.z) > FIELD_D / 2) u.vz *= -1;
    }
    const target = pilot.byVisitor() && clickGoal !== null ? clickGoal : goal;
    const dx = target.x - hero.x, dz = target.z - hero.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1) {
      const step = Math.min(dist, 14 * dt);
      hero.x += (dx / dist) * step;
      hero.z += (dz / dist) * step;
      hero.yaw = Math.atan2(dx, dz);
      trace.hit("center");
    } else if (!pilot.byVisitor()) {
      goal = { x: (rand() - 0.5) * FIELD_W * 0.9, z: (rand() - 0.5) * FIELD_D * 0.9 };
    }

    const now = performance.now();
    if (now - lastMap > 100) {
      lastMap = now;
      trace.hit("markers");
      const markers = units.map((u) => ({ id: u.id, position: [u.x, 0, u.z] as const, kind: u.team }));
      root.render(
        createElement(Minimap, {
          markers,
          center: [hero.x, hero.z],
          facingYaw: hero.yaw,
          worldRadius: dials.worldRadius,
          rotate: dials.rotate,
          size: MAP_SIZE,
          title: "Minimap",
        }),
      );
    }

    // The game's own view of the field: world +x to the right, +z up.
    scale = Math.min((width - 20) / FIELD_W, (height - 20) / FIELD_D);
    originX = width / 2;
    originY = height / 2;
    const sx = (x: number) => originX + x * scale;
    const sy = (z: number) => originY - z * scale;
    ctx.fillStyle = "#14201a";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let x = -FIELD_W / 2; x <= FIELD_W / 2; x += 20) {
      ctx.beginPath();
      ctx.moveTo(sx(x), sy(-FIELD_D / 2));
      ctx.lineTo(sx(x), sy(FIELD_D / 2));
      ctx.stroke();
    }
    for (let z = -FIELD_D / 2; z <= FIELD_D / 2; z += 20) {
      ctx.beginPath();
      ctx.moveTo(sx(-FIELD_W / 2), sy(z));
      ctx.lineTo(sx(FIELD_W / 2), sy(z));
      ctx.stroke();
    }
    // What the minimap shows: a circle of worldRadius around the hero.
    ctx.strokeStyle = "rgba(255,178,122,0.6)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(sx(hero.x), sy(hero.z), dials.worldRadius * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const u of units) {
      ctx.fillStyle = DEFAULT_MARKER_KINDS[u.team]?.color ?? "#fff";
      ctx.beginPath();
      ctx.arc(sx(u.x), sy(u.z), u.team === "loot" ? 3.5 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(sx(hero.x), sy(hero.z));
    ctx.rotate(hero.yaw);
    ctx.fillStyle = DEFAULT_MARKER_KINDS.player!.color;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    drawPill(ctx, pilot.byVisitor() ? "Click to move the hero" : "Your game · click to move the hero", 12, 12, pilot.byVisitor() ? "live" : "accent");
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(`units: ${units.length} objects in your array`, 12, height - 14);
  }, { label: "A field of units and the engine's minimap of them. Click to move the hero." });
  container.appendChild(panel);

  const onPointer = (e: PointerEvent) => {
    const rect = view.canvas.getBoundingClientRect();
    clickGoal = { x: (e.clientX - rect.left - originX) / scale, z: -(e.clientY - rect.top - originY) / scale };
    pilot.touch();
  };
  view.canvas.addEventListener("pointerdown", onPointer);
  const holdTimer = setInterval(() => {
    if (clickGoal !== null && Math.hypot(clickGoal.x - hero.x, clickGoal.z - hero.z) > 1) pilot.touch();
  }, 300);

  return {
    setDials(next) {
      dials = next;
      fillUnits(Math.round(next.units));
    },
    dispose() {
      clearInterval(holdTimer);
      view.canvas.removeEventListener("pointerdown", onPointer);
      view.dispose();
      // Unmount after React finishes the current render.
      queueMicrotask(() => {
        root.unmount();
        panel.remove();
      });
    },
  };
}
