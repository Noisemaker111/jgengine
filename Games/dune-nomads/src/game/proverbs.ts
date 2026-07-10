export interface ProverbEvent {
  id: string;
  text: string;
}

export const PROVERBS: Record<string, string> = {
  start: "The wind writes the road anew.",
  tailwind: "Ride the wind's favor while it lasts.",
  headwind: "The windward face teaches; few pass the lesson twice.",
  crest: "The lee face forgives what the climb cost you.",
  straggler: "A caravan is only as fast as its slowest skin.",
  dockOpen: "Water is the only true coin.",
  dockFull: "Fill deep — the sand does not bargain twice.",
  dockQuick: "A gambler's sip, and back to the wind.",
  waterLow: "The skins grow light. The city grows far.",
  waterCritical: "Drink here, or drink dust the rest of the way.",
  rivalNear: "Another caravan's dust rides your heels.",
  win: "Meridaan's gates remember the caravans that reach them.",
  strandedWater: "Every dune remembers a caravan that did not.",
  strandedRival: "The wind favored another skin today.",
};

export const START_SCREEN_PROVERBS: readonly string[] = [
  "The wind writes the road anew.",
  "Water is the only true coin.",
  "The lee face forgives; the windward face teaches.",
  "A full skin is a short memory.",
];
