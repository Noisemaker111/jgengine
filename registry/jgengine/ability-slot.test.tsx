import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AbilitySlotButton } from "@/components/ui/ability-slot";

describe("AbilitySlotButton accessible name", () => {
  test("derives the button's accessible name from label + cost", () => {
    const html = renderToStaticMarkup(<AbilitySlotButton label="Archer Post" cost="50g" />);
    expect(html).toContain('aria-label="Archer Post — 50g"');
    expect(html).toContain('title="Archer Post — 50g"');
  });

  test("uses the label alone when no cost is present", () => {
    const html = renderToStaticMarkup(<AbilitySlotButton label="Fireball" />);
    expect(html).toContain('aria-label="Fireball"');
    expect(html).not.toContain("—");
  });

  test("omits the accessible-name attributes when no label is given", () => {
    const html = renderToStaticMarkup(<AbilitySlotButton />);
    expect(html).not.toContain("aria-label");
    expect(html).not.toContain("title=");
  });
});
