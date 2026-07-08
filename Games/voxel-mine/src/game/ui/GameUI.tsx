import { Hotbar } from "./Hotbar";
import { Objectives } from "./Objectives";
import { PickupToast } from "./PickupToast";
import { ResourceTally } from "./ResourceTally";

export function GameUI() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-4 top-4">
        <Objectives />
      </div>
      <div className="absolute right-4 top-4">
        <ResourceTally />
      </div>
      <div className="absolute inset-x-0 bottom-28 flex justify-center">
        <PickupToast />
      </div>
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <Hotbar />
      </div>
    </div>
  );
}
