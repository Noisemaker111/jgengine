import { useEffect, useRef, useState, type ReactNode } from "@jgengine/core/ui/jsx";

import { useFrameJoin } from "@jgengine/core/frame/engineHost.draw";

import { WaypointMarkers, type WaypointMarkerTheme } from "@jgengine/core/map/waypointMarkers.view";
import { waypointAnchor } from "@jgengine/core/map/waypoints";
import { onboardingOf } from "@jgengine/core/onboarding/onboardingSystem";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useWorldProjection } from "@jgengine/shell/world/WorldEntityFrames";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { HudOverlay } from "@jgengine/core/hud/hudOverlay.draw";


/**
 * The onboarding's on-screen pointer, mounted in a game's `WorldOverlay`: a pin over the current
 * step's target while it is in view, an edge arrow pointing the way with the distance while it is
 * not (`WaypointMarkers` over the onboarding's waypoint).
 *
 * @capability onboarding-pointer on-screen pin or edge arrow with distance to the current onboarding step's target
 */
export function OnboardingPointer({ ctx, theme }: { ctx: GameContext; theme?: WaypointMarkerTheme }): ReactNode {
  const runtime = onboardingOf(ctx);
  const size = useEngineHost().frame.size;
  const project = useWorldProjection();
  const [, setTick] = useState(0);
  const drawn = useRef("");
  const distanceTo = (position: readonly [number, number]): number | undefined => {
    const me = ctx.scene.entity.get(ctx.player.userId);
    return me === null ? undefined : Math.hypot(position[0] - me.position[0], position[1] - me.position[2]);
  };
  // Re-render only when the pin moves a pixel or its distance changes, so a still camera (and the
  // shader warmup behind the loading cover) costs no React work.
  const joinFrame = useFrameJoin();
  useEffect(() => joinFrame(0, () => {
    if (runtime === null) return;
    const now = runtime.waypoints
      .list()
      .map((waypoint) => {
        const at = project(waypointAnchor(waypoint));
        return `${waypoint.id}:${waypoint.label ?? ""}:${at === null ? "-" : `${Math.round(at.x)},${Math.round(at.y)},${at.behind === true ? 1 : 0}`}:${Math.round(distanceTo(waypoint.position) ?? -1)}`;
      })
      .join("|");
    if (now === drawn.current) return;
    drawn.current = now;
    setTick((n) => (n + 1) % 1_000_000);
  }), [runtime, project]);
  if (runtime === null) return null;
  return (
    <HudOverlay zIndex={25}>
      <WaypointMarkers
        entries={runtime.waypoints}
        project={project}
        viewport={{ width: size.width, height: size.height }}
        distanceOf={(waypoint) => distanceTo(waypoint.position)}
        kindColors={{ objective: theme?.color ?? "#facc15" }}
        {...(theme === undefined ? {} : { theme })}
      />
    </HudOverlay>
  );
}
