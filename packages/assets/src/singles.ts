import type { SingleAsset } from "./manifest";
import data from "./singles.json" with { type: "json" };

export const singles: readonly SingleAsset[] = data as SingleAsset[];
