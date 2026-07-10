import { useEffect, useState } from "react";
import { useGameContext } from "@jgengine/react/provider";
import { usePlayer } from "@jgengine/react/hooks";

import { getBridge } from "../runtime/bridge";

export interface LiveHud {
  attached: boolean;
  apexOpen: boolean;
  altitude: number;
  speed: number;
  now: number;
  position: readonly [number, number, number];
  yaw: number;
}

const EMPTY: LiveHud = { attached: false, apexOpen: false, altitude: 0, speed: 0, now: 0, position: [0, 0, 0], yaw: 0 };

/** Self-ticking read of the flight bridge + clock, mirroring the engine's own `SkillCheckBar`/`QteTrack` pattern — the ring, streak, and altitude tick need per-frame data no `ctx.subscribe` event carries. */
export function useLiveHud(): LiveHud {
  const ctx = useGameContext();
  const { userId } = usePlayer();
  const [state, setState] = useState<LiveHud>(EMPTY);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const bridge = getBridge();
      const entity = ctx.scene.entity.get(userId);
      setState({
        attached: bridge.attached,
        apexOpen: bridge.apex.windowRemaining > 0,
        altitude: entity?.position[1] ?? 0,
        speed: Math.hypot(bridge.velocity.x, bridge.velocity.y, bridge.velocity.z),
        now: ctx.time.now(),
        position: entity?.position ?? [0, 0, 0],
        yaw: bridge.aim.yaw,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ctx, userId]);

  return state;
}
