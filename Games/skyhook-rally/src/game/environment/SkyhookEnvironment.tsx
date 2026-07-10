import { archipelago } from "../../world";
import { CloudPuffMesh } from "./CloudPuff";
import { DressingPropMesh } from "./DressingProp";
import { IsletMesh } from "./Islet";
import { PylonMesh } from "./Pylon";

/**
 * Renders the whole floating archipelago from `archipelago` (deterministic,
 * game-owned data — see `game/world/archipelago.ts` for why this game can't
 * use `environment()`'s single-heightfield terrain). No props: the shell
 * mounts this with none, inside `<GameProvider>` and the R3F canvas.
 */
export function SkyhookEnvironment() {
  return (
    <group>
      {archipelago.clouds.map((cloud) => (
        <CloudPuffMesh key={cloud.id} cloud={cloud} />
      ))}
      {archipelago.islets.map((islet) => (
        <IsletMesh key={islet.id} islet={islet} />
      ))}
      {archipelago.pylons.map((pylon) => (
        <PylonMesh key={pylon.id} pylon={pylon} />
      ))}
      {archipelago.props.map((prop) => (
        <DressingPropMesh key={prop.id} prop={prop} />
      ))}
    </group>
  );
}
