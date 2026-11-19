import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";

export const LOOKS_USED = { hdri: ["desert-noon"], lut: ["sun-bleached-comic"], fonts: [] } as const;

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
