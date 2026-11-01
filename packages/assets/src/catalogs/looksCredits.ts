import type { CreditsDocument, CreditsSection } from "@jgengine/core/menu/credits";

import { FONT_LICENSE, fontOf } from "./fontLibrary";
import { HDRI_LICENSE, hdriOf } from "./hdriLibrary";
import { LUT_GRADE_LICENSE, lutGradeOf } from "./lutGrades";

/** The curated looks a game ships, by id. Omit a list to credit none of that kind. */
export interface LooksUsed {
  hdri?: readonly string[];
  lut?: readonly string[];
  fonts?: readonly string[];
}

/**
 * Credit sections for the HDRIs, colour grades and fonts a game ships, each entry with its author
 * and licence. Fold the result into a game's credits with `mergeCredits`.
 *
 * @capability looks-credits credit lines for the shipped HDRIs, colour grades and fonts a game uses
 */
export function creditsForLooks(used: LooksUsed): CreditsSection[] {
  const sections: CreditsSection[] = [];
  if (used.hdri !== undefined && used.hdri.length > 0) {
    sections.push({
      heading: "HDRI skies",
      entries: used.hdri.map((id) => {
        const entry = hdriOf(id);
        return { label: `${entry.title} — ${entry.author}`, detail: HDRI_LICENSE, href: `https://polyhaven.com/a/${entry.polyhaven}` };
      }),
    });
  }
  if (used.lut !== undefined && used.lut.length > 0) {
    sections.push({ heading: "Colour grades", entries: used.lut.map((id) => ({ label: `${lutGradeOf(id).title} — JGengine`, detail: LUT_GRADE_LICENSE })) });
  }
  if (used.fonts !== undefined && used.fonts.length > 0) {
    sections.push({
      heading: "Fonts",
      entries: used.fonts.map((id) => {
        const entry = fontOf(id);
        return { label: `${entry.family} — ${entry.author}`, detail: FONT_LICENSE, href: `https://fonts.google.com/specimen/${encodeURIComponent(entry.family)}` };
      }),
    });
  }
  return sections;
}

/** {@link creditsForLooks} as a ready credits document. */
export function creditsDocumentForLooks(used: LooksUsed, title = "Looks"): CreditsDocument {
  return { title, sections: creditsForLooks(used) };
}
