import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { session } from "./session";

/**
 * Onboarding as it happens: the first time each twist shows up on the street, one notice says what
 * it is and which worker answers it. Each tip shows once per day.
 */
export const TIPS = {
  distracted: "A worker is looking at their phone! Teachers snap workers out of it, Librarians hush pings, Monks keep workers offline",
  flyer: "Drones fly: Baristas, Construction Workers and Janitors can't reach them. Farmers can",
  camera: "A Flock camera spotted a worker: every notification goes for them first. Take the camera down",
  overheat: "Running hot: workers near it slow down. A Firefighter's hose lands more than double on it",
  wet: "Soaked tech takes 2.5x from an Electrician's shock",
  boost: "A Wi-Fi router boosts and patches the tech around it: take it out first",
  parcel: "A drone dropped a parcel on a plot: click it to sign for it",
  update: "Installing Update…: burst it down before the bar fills or it comes out armored",
} as const;

export type TipId = keyof typeof TIPS;

/** Show a tip once per day. */
export function tip(ctx: GameContext, id: TipId): void {
  if (session.tipsShown.has(id)) return;
  session.tipsShown.add(id);
  ctx.game.notices.push({ text: TIPS[id], ttlMs: 6000 });
}
