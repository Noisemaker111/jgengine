/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, useState, type ReactNode } from "@jgengine/core/ui/jsx";

import { gamePhase } from "@jgengine/core/game/gamePhase";
import { WaypointMarkers } from "@jgengine/core/map/waypointMarkers.view";
import type { WaypointEntry } from "@jgengine/core/map/waypoints";
import { useGameContext } from "@jgengine/ui/provider";
import { useWorldProjection } from "@jgengine/shell/world/WorldEntityFrames";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { HudOverlay } from "@jgengine/core/hud/hudOverlay.draw";

import { ELEMENT_COLORS, FERRALON } from "../palette";
import { questWaypoint } from "../quests/waypoint";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";

/** Frames between looks for the objective: enemies walk, so the marker follows them a few times a second. */
const LOOK_EVERY_FRAMES = 8;


/**
 * The quest marker: a pin over the tracked objective while it is in view, an edge arrow with the
 * distance while it is not. It follows the mission log's first card, and with no mission it points at
 * the nearest person who has one.
 */
export function QuestMarker(): ReactNode {
  const ctx = useGameContext();
  const size = useEngineHost().frame.size;
  const project = useWorldProjection();
  const [entries, setEntries] = useState<readonly WaypointEntry[]>([]);
  const frames = useRef(0);
  const drawn = useRef("");
  useFrameTask(() => {
    frames.current += 1;
    if (frames.current % LOOK_EVERY_FRAMES !== 0) return;
    const goal = gamePhase(ctx) === "playing" ? questWaypoint(ctx) : null;
    const me = ctx.scene.entity.get(ctx.player.userId);
    const distance = goal === null || me === null ? -1 : Math.round(Math.hypot(goal.x - me.position[0], goal.z - me.position[2]));
    const key = goal === null ? "" : `${goal.label}:${goal.x.toFixed(1)},${goal.z.toFixed(1)}:${distance}`;
    if (key === drawn.current) return;
    drawn.current = key;
    setEntries(goal === null ? [] : [{ id: "quest", kind: goal.kind, label: goal.label, position: [goal.x, goal.z], height: goal.y + 1.6 }]);
  });
  const distanceOf = (waypoint: WaypointEntry): number | undefined => {
    const me = ctx.scene.entity.get(ctx.player.userId);
    return me === null ? undefined : Math.hypot(waypoint.position[0] - me.position[0], waypoint.position[1] - me.position[2]);
  };
  if (entries.length === 0) return null;
  return (
    <HudOverlay zIndex={25}>
      <WaypointMarkers
        entries={entries}
        project={project}
        viewport={{ width: size.width, height: size.height }}
        distanceOf={distanceOf}
        theme={{ color: FERRALON.hudAmber }}
        kindColors={{ enemy: ELEMENT_COLORS.incendiary }}
      />
    </HudOverlay>
  );
}
