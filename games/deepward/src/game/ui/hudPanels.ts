import type { HudAnchor } from "@jgengine/core/ui/hudLayout";

/** Every live HUD block, its anchor and its lane. One owner: the UI spreads these onto `HudPanel`. */
export interface HudPanelClaim {
  id: HudPanelId;
  anchor: HudAnchor;
  lane: string;
  order: number;
  /** Where the block goes on a portrait phone, when the landscape spot would collide there. */
  portrait?: { anchor: HudAnchor; order: number };
  /** Measured rendered size at 1600x900, at 844x390 and at a 390x844 portrait phone, in screen pixels. On small screens `HudCanvas` zooms the whole HUD by 0.86, so in its own pixels both these sizes and the frame divide by that zoom. */
  measured: { wide: { w: number; h: number }; compact: { w: number; h: number }; portrait: { w: number; h: number } };
}
export type HudPanelId = "shift" | "depth" | "air" | "haul" | "home" | "radio" | "prompt";

/*
 * Deepward's HUD is the diver's visor. The dive computer sits on the lower-left edge and the kit
 * counter on the lower-right; the depth strip rides the brow and the hold tab the top-right corner.
 * The action plate and Marrow's radio share the bottom-centre lane, and at home the printed
 * departure docket takes the top-left. A portrait phone has no room for three blocks along one edge,
 * so there the dial and the kit climb to the top corners and the depth strip joins the bottom lane.
 * The engine resolves the lanes, so nothing places itself.
 */
export const HUD_PANELS: readonly HudPanelClaim[] = [
  { id: "home", anchor: "top-left", lane: "rail", order: 0, measured: { wide: { w: 292, h: 285 }, compact: { w: 251, h: 136 }, portrait: { w: 215, h: 245 } } },
  { id: "depth", anchor: "top", lane: "rail", order: 0, portrait: { anchor: "bottom", order: 0 }, measured: { wide: { w: 379, h: 34 }, compact: { w: 326, h: 29 }, portrait: { w: 253, h: 29 } } },
  { id: "shift", anchor: "top-right", lane: "rail", order: 0, measured: { wide: { w: 106, h: 30 }, compact: { w: 91, h: 26 }, portrait: { w: 91, h: 26 } } },
  { id: "air", anchor: "bottom-left", lane: "rail", order: 0, portrait: { anchor: "top-left", order: 1 }, measured: { wide: { w: 290, h: 124 }, compact: { w: 225, h: 92 }, portrait: { w: 194, h: 77 } } },
  { id: "haul", anchor: "bottom-right", lane: "rail", order: 0, portrait: { anchor: "top-right", order: 1 }, measured: { wide: { w: 216, h: 138 }, compact: { w: 186, h: 118 }, portrait: { w: 138, h: 94 } } },
  { id: "prompt", anchor: "bottom", lane: "rail", order: 0, portrait: { anchor: "bottom", order: 1 }, measured: { wide: { w: 260, h: 40 }, compact: { w: 224, h: 34 }, portrait: { w: 224, h: 34 } } },
  { id: "radio", anchor: "bottom", lane: "rail", order: 1, portrait: { anchor: "bottom", order: 2 }, measured: { wide: { w: 460, h: 47 }, compact: { w: 258, h: 52 }, portrait: { w: 309, h: 57 } } },
];

const byId = new Map(HUD_PANELS.map(claim => [claim.id, claim] as const));
/** The panel props for one block; the claim table is the source, not the call site. */
export function placement(id: HudPanelId, portrait = false): { id: string; anchor: HudAnchor; lane: string; order: number } {
  const claim = byId.get(id);
  if (claim === undefined) throw new Error(`deepward: no HUD lane declared for "${id}"`);
  const spot = portrait && claim.portrait !== undefined ? claim.portrait : claim;
  return { id: claim.id, anchor: spot.anchor, lane: claim.lane, order: spot.order };
}
