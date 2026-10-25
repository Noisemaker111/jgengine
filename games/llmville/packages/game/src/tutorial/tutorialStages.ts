export const TUTORIAL_STAGE_VALUES = [
  "open_tablet",
  "place_rack",
  "buy_gpus",
  "install_gpus",
  "license_scraper",
  "scrape_tokens",
  "fine_tune",
  "reveal_model",
  "serve",
  "complete",
] as const;

export type TutorialStage = (typeof TUTORIAL_STAGE_VALUES)[number];

/** Named tutorial stage ids — import instead of string literals at call sites. */
export const TUTORIAL_STAGE = {
  openTablet: "open_tablet",
  placeRack: "place_rack",
  buyGpus: "buy_gpus",
  installGpus: "install_gpus",
  licenseScraper: "license_scraper",
  scrapeTokens: "scrape_tokens",
  fineTune: "fine_tune",
  revealModel: "reveal_model",
  serve: "serve",
  complete: "complete",
} as const satisfies Record<string, TutorialStage>;

export const TUTORIAL_OBJECTIVE_STEP_COUNT = 9;