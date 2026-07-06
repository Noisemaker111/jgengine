import type { AssetSource } from "../manifest";
import { kaykitSources } from "./kaykit";
import { kenneySources } from "./kenney";
import { quaterniusSources } from "./quaternius";

export const sources: readonly AssetSource[] = [
  ...kenneySources,
  ...quaterniusSources,
  ...kaykitSources,
];

export const sourceById: ReadonlyMap<string, AssetSource> = new Map(
  sources.map((source) => [source.id, source]),
);

export { kaykitSources, kenneySources, quaterniusSources };
