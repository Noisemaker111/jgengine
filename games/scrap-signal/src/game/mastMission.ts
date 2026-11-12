import type { MissionDef } from "@jgengine/core/mission/mission";

/**
 * The Mast Watch contract as data: its ids and objective graph. Kept apart from the runtime in
 * `mast.ts` so the editor (`editorKinds.ts`) can list its mission, objective and fail-state ids in
 * the mission marker inspector without loading the game's systems.
 */

/** Authored sites the contract reads: the board the player accepts at and the mast it defends. */
export const MAST_BOARD = "signal_mast_board";
export const MAST_SITE = "signal_mast_rustflat";
export const MAST_WATCH_ID = "mast_watch";
export const MAST_HOLD_SECONDS = 60;
const GUARD_SECONDS = 45;

export const MAST_WATCH: MissionDef = {
  id: MAST_WATCH_ID,
  title: "Mast Watch",
  description: "Rustflat's signal mast is dark and something is nesting in the dish.",
  start: "reach_mast",
  objectives: [
    {
      id: "reach_mast",
      kind: "reach",
      actor: "player",
      marker: MAST_SITE,
      radius: 6,
      label: "Reach the signal mast west of the crash site",
      next: "clear_guard",
    },
    {
      id: "clear_guard",
      kind: "kill",
      count: 2,
      match: { kind: "kill", target: "ripper_pup", tags: ["pistol"] },
      label: "Drop 2 mast guards with a sidearm",
      timeout: GUARD_SECONDS,
      onTimeout: "mast_cold",
      failOn: [{ kind: "fact", fact: "chassis", is: "down", to: "mast_lost", message: "Your chassis went down at the mast." }],
      next: "hold_mast",
    },
    {
      id: "hold_mast",
      kind: "survive",
      duration: MAST_HOLD_SECONDS,
      label: "Hold the mast for 60s",
      failOn: [
        { kind: "left-area", actor: "player", marker: MAST_SITE, radius: 16, to: "mast_lost", message: "You left the mast ring and the uplink dropped." },
        { kind: "fact", fact: "chassis", is: "down", to: "mast_lost", message: "Your chassis went down at the mast." },
      ],
      next: "done",
    },
  ],
  fail: [
    { id: "mast_cold", message: "The mast went cold: its guards were still standing when the window closed." },
    { id: "mast_lost", message: "The uplink dropped before the carrier locked." },
  ],
  rewards: { economy: { cash: 450, cores: 2 } },
};
