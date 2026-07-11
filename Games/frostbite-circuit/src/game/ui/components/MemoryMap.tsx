import { useEffect, useRef } from "react";
import { SettingsTrigger } from "@jgengine/react";

import type { SessionSnapshot } from "../../race/session";
import { SLEDDERS } from "../../ai/sledders";
import type { IceCell } from "../../ice/grid";
import { PALETTE } from "../theme";

const DISPLAY_SIZE = 208;

function cellColor(cell: IceCell | null): [number, number, number, number] {
  if (cell === null) return [0, 0, 0, 0];
  if (cell.status === "solid") return [241, 250, 238, 235];
  if (cell.status === "cracked") return [168, 218, 220, 225];
  return [13, 27, 42, 255];
}

export function MemoryMap({ snapshot }: { snapshot: SessionSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { iceWorld } = snapshot;
  const { config, grid } = iceWorld;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    canvas.width = grid.width;
    canvas.height = grid.height;
    const ctx2d = canvas.getContext("2d");
    if (ctx2d === null) return;
    const image = ctx2d.createImageData(grid.width, grid.height);
    for (let i = 0; i < grid.cells.length; i += 1) {
      const [r, g, b, a] = cellColor(grid.cells[i] ?? null);
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = a;
    }
    ctx2d.putImageData(image, 0, 0);
  }, [grid]);

  const toPx = (x: number, z: number): [number, number] => [(x - config.originX) / config.cellSize, (z - config.originZ) / config.cellSize];

  const displayHeight = DISPLAY_SIZE * (grid.height / grid.width);
  const trailPoints = snapshot.playerTrail.map(([x, z]) => toPx(x, z));
  const [playerX, playerZ] = toPx(snapshot.playerPose.position[0], snapshot.playerPose.position[2]);
  const heading = snapshot.playerPose.heading;
  const arrowLen = grid.width * 0.03;

  return (
    <div
      className="absolute right-4 top-4 flex flex-col gap-1 rounded-lg border p-2 shadow-[0_0_24px_rgba(0,0,0,0.55)]"
      style={{ borderColor: `${PALETTE.iceBlue}33`, backgroundColor: `${PALETTE.deepWater}f0` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: PALETTE.auroraGreen }}>
          Memory Map
        </span>
        <SettingsTrigger className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded-full border border-[#a8dadc]/30 text-[#a8dadc] transition-colors hover:bg-[#a8dadc]/15" />
      </div>
      <div className="relative" style={{ width: DISPLAY_SIZE, height: displayHeight }}>
        <canvas
          ref={canvasRef}
          style={{ width: DISPLAY_SIZE, height: displayHeight, imageRendering: "pixelated", display: "block" }}
        />
        <svg
          className="absolute left-0 top-0"
          width={DISPLAY_SIZE}
          height={displayHeight}
          viewBox={`0 0 ${grid.width} ${grid.height}`}
        >
          {trailPoints.length > 1 && (
            <polyline
              points={trailPoints.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join(" ")}
              fill="none"
              stroke={PALETTE.auroraGreen}
              strokeWidth={Math.max(0.35, grid.width * 0.006)}
              strokeOpacity={0.85}
              strokeLinecap="round"
            />
          )}
          {SLEDDERS.map((def) => {
            const pose = snapshot.sledderPoses[def.id];
            if (pose === undefined) return null;
            const [x, z] = toPx(pose.position[0], pose.position[2]);
            return <circle key={def.id} cx={x} cy={z} r={Math.max(1.4, grid.width * 0.016)} fill={def.livery.primary} stroke={PALETTE.deepWater} strokeWidth={0.4} />;
          })}
          <circle cx={playerX} cy={playerZ} r={Math.max(1.6, grid.width * 0.02)} fill={PALETTE.flareRed} stroke={PALETTE.snowWhite} strokeWidth={0.4} />
          <line
            x1={playerX}
            y1={playerZ}
            x2={playerX + Math.sin(heading) * arrowLen}
            y2={playerZ + Math.cos(heading) * arrowLen}
            stroke={PALETTE.flareRed}
            strokeWidth={Math.max(0.4, grid.width * 0.008)}
          />
        </svg>
      </div>
      <div className="flex justify-between text-[8px] font-semibold uppercase tracking-wide" style={{ color: `${PALETTE.snowWhite}80` }}>
        <span style={{ color: PALETTE.snowWhite }}>■ Solid</span>
        <span style={{ color: PALETTE.iceBlue }}>■ Cracked</span>
        <span style={{ color: `${PALETTE.snowWhite}60` }}>■ Open</span>
      </div>
    </div>
  );
}
