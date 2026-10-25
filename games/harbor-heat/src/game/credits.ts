import { creditsForSourceIds } from "@jgengine/assets/credits";

import { ASSET_SOURCE_IDS } from "./assets";
import { LIBRARY_CREDITS } from "./world/props";

/** One classified on the Tribune's credits page: what was borrowed, who made it, where it lives. */
export interface TribuneAd {
  title: string;
  who: string;
  page: string;
}

/** Every pack Harbor ships, generated from the source ids its catalogs load, so the page cannot drift. */
export const HARBOR_PACK_CREDITS = creditsForSourceIds(ASSET_SOURCE_IDS);

function libraryAd(line: string): TribuneAd {
  const by = line.indexOf(" by ");
  const link = line.lastIndexOf(" http");
  return {
    title: by < 0 ? line : line.slice(0, by),
    who: by < 0 ? "" : line.slice(by + 4, link < 0 ? undefined : link),
    page: link < 0 ? "" : line.slice(link + 1).replace(/^https?:\/\//, ""),
  };
}

/** The packs first, then each realistic library model, as the Tribune prints them. */
export function tribuneAds(): TribuneAd[] {
  const packs = HARBOR_PACK_CREDITS.sections.flatMap((section) =>
    section.entries.map((entry) => ({
      title: entry.label,
      who: [entry.detail, section.heading].filter((part) => part !== undefined && part !== "").join(" · "),
      page: (entry.href ?? "").replace(/^https?:\/\//, ""),
    })),
  );
  return [...packs, ...LIBRARY_CREDITS.map(libraryAd)];
}
