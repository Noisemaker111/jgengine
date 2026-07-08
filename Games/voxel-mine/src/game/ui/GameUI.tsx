import { useDisplayProfile } from "@jgengine/react/display";

import { Hotbar } from "./Hotbar";
import { Objectives } from "./Objectives";
import { PickupToast } from "./PickupToast";
import { ResourceTally } from "./ResourceTally";

export function GameUI() {
  const { coarsePointer } = useDisplayProfile();
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-4 top-4">
        <Objectives />
      </div>
      <div className="absolute right-4 top-4">
        <ResourceTally />
      </div>
      <div className={`absolute inset-x-0 flex justify-center ${coarsePointer ? "bottom-72" : "bottom-28"}`}>
        <PickupToast />
      </div>
      <div className={`absolute inset-x-0 flex justify-center ${coarsePointer ? "bottom-52" : "bottom-6"}`}>
        <Hotbar />
      </div>
    </div>
  );
}
