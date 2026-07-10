import type { DoorDef } from "../schedule/doorSchedule";
import { SCHEDULED_DOORWAYS } from "../mansion/floorPlan";

function doorway(id: string) {
  const found = SCHEDULED_DOORWAYS.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`doors: unknown scheduled doorway "${id}"`);
  return found;
}

export const DOOR_DEFS: readonly DoorDef[] = [
  {
    id: "vault_door",
    name: "Vault Antechamber Door",
    roomAName: "Ballroom",
    roomBName: "Vault Antechamber",
    gapCenter: doorway("vault_door").gapCenter,
    axis: doorway("vault_door").axis,
    initiallyLocked: true,
    events: [
      { at: 150, locked: false },
      { at: 210, locked: true },
      { at: 340, locked: false },
    ],
  },
  {
    id: "gallery_door",
    name: "Gallery Door",
    roomAName: "Grand Gallery",
    roomBName: "Library",
    gapCenter: doorway("gallery_door").gapCenter,
    axis: doorway("gallery_door").axis,
    initiallyLocked: false,
    events: [{ at: 308, locked: true }],
  },
  {
    id: "kitchen_door",
    name: "Kitchen Door",
    roomAName: "Kitchen",
    roomBName: "Music Room",
    gapCenter: doorway("kitchen_door").gapCenter,
    axis: doorway("kitchen_door").axis,
    initiallyLocked: false,
    events: [
      { at: 100, locked: true },
      { at: 260, locked: false },
    ],
  },
  {
    id: "study_door",
    name: "Study Door",
    roomAName: "Study",
    roomBName: "Vault Antechamber",
    gapCenter: doorway("study_door").gapCenter,
    axis: doorway("study_door").axis,
    initiallyLocked: true,
    events: [
      { at: 40, locked: false },
      { at: 140, locked: true },
      { at: 360, locked: false },
    ],
  },
];
