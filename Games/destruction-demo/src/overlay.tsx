import { InstancedBodies } from "@jgengine/shell/world/InstancedBodies";
import { InstancedJoints } from "@jgengine/shell/world/InstancedJoints";
import { CarvedTerrain } from "@jgengine/shell/terrain/CarvedTerrain";

import { currentDemo } from "./state";

export function DestructionOverlay() {
  const demo = currentDemo();
  if (demo === null) return null;
  return (
    <>
      <CarvedTerrain
        field={demo.field}
        size={80}
        segments={160}
        epoch={demo.fieldEpoch}
        colors={{ low: "#3a2c22", high: "#8a7d55", waterline: "#2a3a2c", waterlineHeight: -2.4 }}
        heightRange={[-3.6, 2]}
      />
      <InstancedBodies world={demo.world} debugTint />
      <InstancedJoints world={demo.world} color="#ffd24a" />
    </>
  );
}
