import { bodyOf, conditionOf, ELEMENT_LABELS, heirloomStory, modOf, type GunDef } from "./guns";
import { legendaryNameOf } from "./perks";
import { personalityOf } from "./personality";

/**
 * How a weapon reads on a card: its condition, body, mod and personality in words. One place, so
 * the pickup card, the ammo plate, the hotbar and the workbench never disagree.
 */
export interface JunkCard {
  condition: string;
  body: string;
  bodyText: string;
  mod: string;
  modText: string;
  personality: string;
  perk: string;
  quirk: string;
  personalityColor: string;
  element: string | null;
  /** An heirloom's backstory line. */
  story: string | null;
}

export function junkCard(gun: GunDef): JunkCard {
  const body = bodyOf(gun.family);
  const mod = modOf(gun.manufacturer);
  const personality = personalityOf(gun);
  const heirloom = legendaryNameOf(gun);
  return {
    condition: conditionOf(gun.rarity),
    body: body.body,
    bodyText: body.bodyText,
    mod: mod?.id ?? gun.manufacturer,
    modText: mod?.text ?? "",
    personality: personality.name,
    perk: personality.perk,
    quirk: personality.quirk,
    personalityColor: personality.color,
    element: gun.element === "none" ? null : ELEMENT_LABELS[gun.element],
    story: heirloom === null ? null : (heirloomStory(heirloom) ?? null),
  };
}

/** "Like New Staple Gun + Duct Tape · Cheerful" */
export function junkTagline(gun: GunDef): string {
  const card = junkCard(gun);
  return `${card.condition} ${card.body} + ${card.mod} · ${card.personality}`;
}
