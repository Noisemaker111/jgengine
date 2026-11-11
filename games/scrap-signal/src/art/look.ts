import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";

/** The art direction's looks, named once: the sky, the grade and the type the credits list. */
export const LOOKS_USED = { hdri: ["desert-noon"], lut: ["sun-bleached-comic"], fonts: [] } as const;

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
