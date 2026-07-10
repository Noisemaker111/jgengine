import { useMemo, type MouseEvent } from "react";
import { bakeTerrainMap } from "@jgengine/shell/map";
import { projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";

import { HudLabel } from "@/components/ui/hud-label";
import { HudPanel } from "@/components/ui/hud-panel";
import { WaypointMarker } from "@/components/ui/waypoint-marker";

import { estimateRouteWaterCost } from "../../caravan/routeEstimate";
import { PLAYER_BASE_SPEED } from "../../caravan/constants";
import { DUNE_GOLD, OASIS_GREEN, SHADOW_OCHRE, hexToRgb } from "../../palette";
import type { RunState } from "../../run/runState";
import { CITY, OASES } from "../../world/sites";
import { terrainField } from "../../../world";
import { unprojectFromMinimap, windBearingRad } from "../mapProjection";

const MAP_RADIUS = 1250;
const BOUNDS = { minX: -MAP_RADIUS, minZ: -MAP_RADIUS, maxX: MAP_RADIUS, maxZ: MAP_RADIUS };

interface MapPanelProps {
  state: RunState;
  windVector: readonly [number, number];
  windSpeed: number;
  windSecondsUntilNext: number;
  onPin: (point: { x: number; z: number }) => void;
  onUnpin: (index: number) => void;
  onToggle: () => void;
}

export function MapPanel({ state, windVector, windSpeed, windSecondsUntilNext, onPin, onUnpin, onToggle }: MapPanelProps) {
  const size = state.mapOpen ? 420 : 190;
  const baked = useMemo(
    () =>
      bakeTerrainMap(terrainField, BOUNDS, {
        resolution: 160,
        landLow: hexToRgb(SHADOW_OCHRE),
        landHigh: hexToRgb(DUNE_GOLD),
        water: hexToRgb(OASIS_GREEN),
      }),
    [],
  );

  const view: MinimapView = { center: [0, 0], worldRadius: MAP_RADIUS, size };

  const routePoints = [{ x: state.player.x, z: state.player.z }, ...state.flags];
  const estimate =
    state.flags.length > 0 ? estimateRouteWaterCost(routePoints, terrainField, windVector, PLAYER_BASE_SPEED) : null;

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (state.flags.length >= 3) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * size;
    const py = ((event.clientY - rect.top) / rect.height) * size;
    onPin(unprojectFromMinimap(px, py, view));
  }

  const bearing = (windBearingRad(windVector) * 180) / Math.PI;

  return (
    <HudPanel
      title="The Sand"
      width={size + 28}
      actions={
        <button
          type="button"
          onClick={onToggle}
          className="text-[10px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "var(--jg-text-dim)", background: "transparent", border: "none", cursor: "pointer" }}
        >
          {state.mapOpen ? "Collapse (M)" : "Expand (M)"}
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="block h-0 w-0"
              style={{
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderBottom: "12px solid var(--jg-accent)",
                transform: `rotate(${bearing}deg)`,
                filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.8))",
              }}
            />
            <span className="font-mono text-[11px]" style={{ color: "var(--jg-text)" }}>
              {windSpeed.toFixed(1)} kt
            </span>
          </div>
          <HudLabel>Shift in {Math.ceil(windSecondsUntilNext)}s</HudLabel>
        </div>

        <div
          onClick={handleClick}
          className="relative cursor-crosshair overflow-hidden"
          style={{
            width: size,
            height: size,
            border: "1px solid var(--jg-edge)",
            backgroundImage: baked !== null ? `url(${baked.url})` : undefined,
            backgroundColor: SHADOW_OCHRE,
            backgroundSize: "cover",
          }}
        >
          <svg className="pointer-events-none absolute inset-0" width={size} height={size}>
            {routePoints.length > 1 &&
              (() => {
                const pixels = routePoints.map((point) => projectToMinimap([point.x, point.z], view));
                const d = pixels.map((point) => `${point.x},${point.y}`).join(" ");
                return (
                  <polyline
                    points={d}
                    fill="none"
                    stroke={DUNE_GOLD}
                    strokeWidth={2}
                    strokeDasharray="4 5"
                    opacity={0.9}
                  />
                );
              })()}
          </svg>

          {OASES.map((oasis) => {
            const point = projectToMinimap([oasis.x, oasis.z], view);
            if (!point.inside) return null;
            return (
              <WaypointMarker
                key={oasis.id}
                x={(point.x / size) * 100}
                y={(point.y / size) * 100}
                kind="ally"
              />
            );
          })}

          {(() => {
            const point = projectToMinimap([CITY.x, CITY.z], view);
            return point.inside ? (
              <WaypointMarker x={(point.x / size) * 100} y={(point.y / size) * 100} kind="objective" label="Meridaan" />
            ) : null;
          })()}

          {(() => {
            const point = projectToMinimap([state.rival.position[0], state.rival.position[2]], view);
            return point.inside ? (
              <WaypointMarker x={(point.x / size) * 100} y={(point.y / size) * 100} kind="danger" />
            ) : null;
          })()}

          <span
            aria-hidden
            className="absolute"
            style={{
              left: `${(projectToMinimap([state.player.x, state.player.z], view).x / size) * 100}%`,
              top: `${(projectToMinimap([state.player.x, state.player.z], view).y / size) * 100}%`,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--jg-mana)",
              border: "2px solid var(--jg-text)",
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 6px rgba(0,0,0,0.7)",
            }}
          />

          {state.flags.map((flag, index) => {
            const point = projectToMinimap([flag.x, flag.z], view);
            return (
              <button
                key={index}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUnpin(index);
                }}
                className="pointer-events-auto absolute flex items-center justify-center"
                style={{
                  left: `${(point.x / size) * 100}%`,
                  top: `${(point.y / size) * 100}%`,
                  transform: "translate(-50%, -100%)",
                  width: 14,
                  height: 18,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
                aria-label={`Unpin flag ${index + 1}`}
              >
                <span
                  aria-hidden
                  style={{
                    display: "block",
                    width: 0,
                    height: 0,
                    borderTop: "6px solid transparent",
                    borderBottom: "6px solid transparent",
                    borderLeft: `10px solid var(--jg-accent)`,
                    filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.8))",
                  }}
                />
              </button>
            );
          })}
        </div>

        {estimate !== null && (
          <div className="flex items-center justify-between font-mono text-[11px]" style={{ color: "var(--jg-text)" }}>
            <span>Route: {Math.round(estimate.totalDistance)}m</span>
            <span style={{ color: "var(--jg-accent)" }}>{estimate.totalWater.toFixed(0)} water</span>
          </div>
        )}
        <HudLabel>{state.flags.length}/3 flags pinned — click the sand to pin, a flag to unpin</HudLabel>
      </div>
    </HudPanel>
  );
}
