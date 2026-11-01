import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";

/** The art direction's sky, grade and type, named once for the engine seams and the credits. */
export const LOOKS_USED = { hdri: ["clear-puresky"], lut: ["sunny-postcard"], fonts: ["lilita-one", "nunito"] } as const;

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
