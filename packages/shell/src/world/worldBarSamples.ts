import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { worldHealthBarAllowsRole } from "@jgengine/core/game/playableGame";
import type { CatalogEntityRole } from "@jgengine/core/runtime/gameContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

export interface WorldBarSample {
  x: number;
  y: number;
  percent: number;
}

export interface Projectable {
  set(x: number, y: number, z: number): this;
  project(camera: { matrixWorldInverse: unknown; projectionMatrix: unknown }): this;
  x: number;
  y: number;
  z: number;
}

export function collectWorldBarSamples(
  ctx: GameContext,
  statId: string,
  height: number,
  roles: readonly CatalogEntityRole[] | undefined,
  resolveRole: ((entity: SceneEntity) => CatalogEntityRole | undefined) | undefined,
  camera: { matrixWorldInverse: unknown; projectionMatrix: unknown },
  viewport: { width: number; height: number },
  into: WorldBarSample[],
  project: Projectable,
  maxDistance = 60,
): number {
  into.length = 0;
  const playerId = ctx.player.userId;
  const player = ctx.scene.entity.get(playerId);
  for (const entity of ctx.scene.entity.list()) {
    if (entity.id === playerId) continue;
    if (!worldHealthBarAllowsRole(roles, resolveRole?.(entity))) continue;
    if (
      player !== null &&
      Math.hypot(entity.position[0] - player.position[0], entity.position[2] - player.position[2]) >
        maxDistance
    ) {
      continue;
    }
    const stat = ctx.scene.entity.stats.get(entity.id, statId);
    if (stat === null) continue;
    const range = stat.max - stat.min;
    const percent = range <= 0 ? 0 : Math.max(0, Math.min(1, (stat.current - stat.min) / range));
    project.set(entity.position[0], entity.position[1] + height, entity.position[2]);
    project.project(camera);
    if (project.z < -1 || project.z > 1) continue;
    const x = (project.x * 0.5 + 0.5) * viewport.width;
    const y = (-project.y * 0.5 + 0.5) * viewport.height;
    into.push({ x, y, percent });
  }
  return into.length;
}

export function paintWorldBarSamples(
  canvas: { width: number; height: number; getContext(kind: "2d"): CanvasRenderingContext2D | null },
  samples: readonly WorldBarSample[],
  dpr: number,
  barWidthPx = 112,
  barHeightPx = 10,
): void {
  const g = canvas.getContext("2d");
  if (g === null) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const halfW = barWidthPx / 2;
  const halfH = barHeightPx / 2;
  for (const sample of samples) {
    const left = sample.x - halfW;
    const top = sample.y - halfH;
    g.fillStyle = "rgba(0,0,0,0.7)";
    g.strokeStyle = "rgba(0,0,0,0.7)";
    g.lineWidth = 1;
    g.fillRect(left, top, barWidthPx, barHeightPx);
    g.strokeRect(left + 0.5, top + 0.5, barWidthPx - 1, barHeightPx - 1);
    const fill = Math.max(0, Math.min(barWidthPx, sample.percent * barWidthPx));
    if (fill > 0) {
      const gradient = g.createLinearGradient(left, top, left + barWidthPx, top);
      gradient.addColorStop(0, "#e11d48");
      gradient.addColorStop(1, "#f87171");
      g.fillStyle = gradient;
      g.fillRect(left, top, fill, barHeightPx);
    }
  }
}
