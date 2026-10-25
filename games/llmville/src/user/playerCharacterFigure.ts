/** Matte painted vinyl-figure palette — no pure white/black, no chrome. */
export const LLMVILLE_CHARACTER_PALETTE = {
  cream: "#f4ecdd",
  warmGray: "#8a8478",
  charcoal: "#2a3633",
  deepTeal: "#3c8c76",
  teal: "#5fc2a8",
  sage: "#7a9e8e",
  amber: "#e0a95c",
  coral: "#e8836b",
  warmBrown: "#9a7355",
  ink: "#1f2b28",
  fishBlue: "#4a8fd4",
  fishGold: "#e0a95c",
  fishViolet: "#8b7fd4",
  fishEmerald: "#3c9e7a",
  hoodieCream: "#e5dac8",
  pantsBlue: "#3d7ab8",
  shoeWhite: "#e8e8e8",
} as const;

export type CharacterFishColorId = "beta_blue" | "gold" | "coral" | "violet" | "emerald";
export type CharacterHoodieColorId = "cream" | "teal" | "sage" | "charcoal" | "coral";
export type CharacterPantsColorId = "blue" | "charcoal" | "ink" | "sage" | "amber";
export type CharacterShoesColorId = "white" | "warm_brown" | "charcoal" | "coral" | "teal";

export interface CharacterLook {
  fish: CharacterFishColorId;
  hoodie: CharacterHoodieColorId;
  pants: CharacterPantsColorId;
  shoes: CharacterShoesColorId;
}

export const CHARACTER_FISH_COLORS: Record<CharacterFishColorId, { label: string; color: string }> = {
  beta_blue: { label: "Beta blue", color: LLMVILLE_CHARACTER_PALETTE.fishBlue },
  gold: { label: "Gold", color: LLMVILLE_CHARACTER_PALETTE.fishGold },
  coral: { label: "Coral", color: LLMVILLE_CHARACTER_PALETTE.coral },
  violet: { label: "Violet", color: LLMVILLE_CHARACTER_PALETTE.fishViolet },
  emerald: { label: "Emerald", color: LLMVILLE_CHARACTER_PALETTE.fishEmerald },
};

export const CHARACTER_HOODIE_COLORS: Record<CharacterHoodieColorId, { label: string; color: string }> = {
  cream: { label: "Cream", color: LLMVILLE_CHARACTER_PALETTE.hoodieCream },
  teal: { label: "Lab teal", color: LLMVILLE_CHARACTER_PALETTE.teal },
  sage: { label: "Sage", color: LLMVILLE_CHARACTER_PALETTE.sage },
  charcoal: { label: "Charcoal", color: LLMVILLE_CHARACTER_PALETTE.charcoal },
  coral: { label: "Coral", color: LLMVILLE_CHARACTER_PALETTE.coral },
};

export const CHARACTER_PANTS_COLORS: Record<CharacterPantsColorId, { label: string; color: string }> = {
  blue: { label: "Denim blue", color: LLMVILLE_CHARACTER_PALETTE.pantsBlue },
  charcoal: { label: "Charcoal", color: LLMVILLE_CHARACTER_PALETTE.charcoal },
  ink: { label: "Ink", color: LLMVILLE_CHARACTER_PALETTE.ink },
  sage: { label: "Sage", color: LLMVILLE_CHARACTER_PALETTE.sage },
  amber: { label: "Amber", color: LLMVILLE_CHARACTER_PALETTE.amber },
};

export const CHARACTER_SHOES_COLORS: Record<CharacterShoesColorId, { label: string; color: string }> = {
  white: { label: "White", color: LLMVILLE_CHARACTER_PALETTE.shoeWhite },
  warm_brown: { label: "Warm brown", color: LLMVILLE_CHARACTER_PALETTE.warmBrown },
  charcoal: { label: "Charcoal", color: "#2f3b38" },
  coral: { label: "Coral", color: LLMVILLE_CHARACTER_PALETTE.coral },
  teal: { label: "Teal", color: LLMVILLE_CHARACTER_PALETTE.teal },
};

/** Authored base colors used as multiply-tint denominators for the fishbowl texture atlas. */
export const CHARACTER_REGION_BASE_COLORS = {
  fish: LLMVILLE_CHARACTER_PALETTE.fishBlue,
  hoodie: LLMVILLE_CHARACTER_PALETTE.hoodieCream,
  pants: LLMVILLE_CHARACTER_PALETTE.pantsBlue,
  shoes: LLMVILLE_CHARACTER_PALETTE.shoeWhite,
} as const;

export const DEFAULT_CHARACTER_LOOK: CharacterLook = {
  fish: "beta_blue",
  hoodie: "cream",
  pants: "blue",
  shoes: "white",
};

/** Shared matte vinyl material tuning for Three.js standard materials. */
export const VINYL_MATERIAL = {
  roughness: 0.9,
  metalness: 0,
  emissiveIntensity: 0.06,
} as const;