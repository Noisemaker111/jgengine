export const PALETTE = {
  gunmetal: "#2b2f36",
  gunmetalDark: "#20242a",
  positiveRed: "#ff4b3e",
  negativeBlue: "#3e7bff",
  cautionStripe: "#ffd23f",
  steelWhite: "#dfe6ee",
} as const;

export const POLARITY_COLOR = { red: PALETTE.positiveRed, blue: PALETTE.negativeBlue } as const;

export const SECTOR_TINTS = ["#3c5a46", "#8a6a2f", "#4a6b8a"] as const;
