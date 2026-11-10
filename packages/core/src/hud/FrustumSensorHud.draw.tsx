/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-ui
import { useMemo, useRef, useState } from "@jgengine/core/ui/jsx";
import { PerspectiveCamera, Vector3, type Camera } from "three";

import {
  createFrustumSensor,
  type FramingConfig,
  type FrustumSample,
  type FrustumTarget,
} from "@jgengine/core/sensor/frustumSensor";
import { useSceneEntities } from "@jgengine/ui/hooks";
import { frustumSampleDisplayEqual } from "@jgengine/core/sensor/frustumSampleEqual";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { HudOverlay } from "@jgengine/core/hud/hudOverlay.draw";

export { frustumSampleDisplayEqual } from "@jgengine/core/sensor/frustumSampleEqual";

function isPerspective(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true;
}

export interface FrustumSensorProbeOptions extends FramingConfig {
  subjectIds: readonly string[];
  subjectRadius?: number;
}

export function useFrustumSensor(options: FrustumSensorProbeOptions): FrustumSample | null {
  const host = useEngineHost();
  const entities = useSceneEntities();
  const sensor = useMemo(() => createFrustumSensor(options), []);
  const [best, setBest] = useState<FrustumSample | null>(null);
  const bestRef = useRef<FrustumSample | null>(null);
  const forward = useRef(new Vector3());

  useFrameTask((_, dt) => {
    const targets: FrustumTarget[] = [];
    for (const id of options.subjectIds) {
      const entity = entities.find((candidate) => candidate.id === id);
      if (entity === undefined) continue;
      targets.push({ id, position: entity.position, radius: options.subjectRadius });
    }
    const camera = host.frame.camera;
    const size = host.frame.size;
    let leader: FrustumSample | null = null;
    if (targets.length > 0) {
      camera.getWorldDirection(forward.current);
      const samples = sensor.tick(
        {
          position: [camera.position.x, camera.position.y, camera.position.z],
          lookAt: [
            camera.position.x + forward.current.x,
            camera.position.y + forward.current.y,
            camera.position.z + forward.current.z,
          ],
          fovDeg: isPerspective(camera) ? camera.fov : 55,
          aspect: size.height === 0 ? 16 / 9 : size.width / size.height,
        },
        targets,
        dt,
      );
      for (const sample of samples) {
        if (!sample.inView) continue;
        if (leader === null || sample.framing > leader.framing) leader = sample;
      }
    }
    if (frustumSampleDisplayEqual(bestRef.current, leader)) return;
    bestRef.current = leader;
    setBest(leader);
  });

  return best;
}

/**
 * Renders inside the Canvas (needs the live camera via `useFrame`/`useThree`)
 * but portals a real HTML readout via drei's `Html fullscreen` — a photo-mode
 * "is this subject framed" HUD.
 */
export function FrustumSensorReadout(props: FrustumSensorProbeOptions & { wrapperClassName?: string; className?: string }) {
  const sample = useFrustumSensor(props);
  return (
    <HudOverlay zIndex={20}>
      <div className={props.wrapperClassName ?? "pointer-events-none absolute bottom-24 right-4"}>
        {sample === null ? (
          <div className={props.className ?? "rounded border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white/50"}>
            No subject framed
          </div>
        ) : (
          <div
            className={
              props.className ??
              "rounded border border-amber-300/40 bg-black/70 px-3 py-1.5 text-xs text-amber-200 shadow-lg"
            }
          >
            <span className="font-semibold uppercase tracking-wide">{sample.id}</span>
            <span className="ml-2 tabular-nums">framing {Math.round(sample.framing * 100)}%</span>
            <span className="ml-2 tabular-nums">dwell {sample.dwellSeconds.toFixed(1)}s</span>
          </div>
        )}
      </div>
    </HudOverlay>
  );
}
