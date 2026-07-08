import { Daylight, EnvironmentScene } from "@jgengine/shell/environment";
import { world } from "../../world";

export function Backdrop() {
  if (world.kind !== "environment") return <Daylight />;
  return (
    <>
      <EnvironmentScene feature={world} />
      <Daylight fog={{ near: 40, far: 140 }} />
    </>
  );
}
