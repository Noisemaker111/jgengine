import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";

/** The art direction's looks, named once: the sky, the grade and the type the credits list. */
export const LOOKS_USED = { hdri: ["clear-noon"], lut: ["vivid-pop"], fonts: [] } as const;

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
