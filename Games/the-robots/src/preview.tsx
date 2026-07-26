import type { GamePreviewProps } from "@jgengine/react/preview";
import { EntityPreview } from "@jgengine/shell/render/EntityPreview";

import { entityModels } from "./game/world/models";

/**
 * The GUN Loader chassis on a studio stage. It is a part composition (`ModelPart.role` →
 * `PartMotionRig`), not a rigged mesh, so this doubles as the only deterministic way to inspect
 * one: in the world the loaders wander, and any given captured vantage may hold no robot at all.
 */
export default function TheRobotsPreview({ className }: GamePreviewProps) {
  const loader = entityModels.loader;
  if (loader === undefined) return <div className={className} style={{ background: "#14161a" }} />;
  return (
    <div className={className} style={{ position: "relative", height: "100%", width: "100%", background: "#14161a" }}>
      <EntityPreview model={loader} mood="studio" cameraPosition={[2.8, 1.9, 6]} fov={34} turntable={0.35} />
    </div>
  );
}
