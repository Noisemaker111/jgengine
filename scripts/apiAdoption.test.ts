import { describe, expect, test } from "bun:test";

import {
  adoptionKey,
  collectSourceAdoption,
  hasPublicIntentEvidence,
  isExportAdopted,
} from "./apiAdoption";
import { isCanonicalDeclarationImport } from "./gen-skill-api";

describe("API adoption evidence", () => {
  test("plain prose and same-name imports from another module do not count", () => {
    const adoption = collectSourceAdoption(`
      // createThing is useful
      import { createThing } from "@jgengine/core/world/other";
    `);
    expect(isExportAdopted(adoption, "jgengine-gameplay", "@jgengine/core/game/createThing", "createThing")).toBe(false);
  });

  test("named aliases retain the exported binding identity", () => {
    const adoption = collectSourceAdoption(
      `import { createThing as makeThing } from "@jgengine/core/game/createThing";`,
    );
    expect(adoption.bindings.has(adoptionKey("@jgengine/core/game/createThing", "createThing"))).toBe(true);
  });

  test("namespace imports count only accessed members", () => {
    const adoption = collectSourceAdoption(`
      import * as things from "@jgengine/core/game/createThing";
      things.createThing();
    `);
    expect(adoption.bindings.has(adoptionKey("@jgengine/core/game/createThing", "createThing"))).toBe(true);
    expect(adoption.bindings.has(adoptionKey("@jgengine/core/game/createThing", "unusedThing"))).toBe(false);
  });

  test("curated domain barrels map consumer use to declarations only in that routed domain", () => {
    const adoption = collectSourceAdoption(`import { createThing } from "@jgengine/core/gameplay";`);
    expect(isExportAdopted(adoption, "jgengine-gameplay", "@jgengine/core/game/createThing", "createThing")).toBe(true);
    expect(isExportAdopted(adoption, "jgengine-world", "@jgengine/core/world/createThing", "createThing")).toBe(false);
  });

  test("an explicit capability tag is valid discovery evidence", () => {
    const adoption = collectSourceAdoption("createThing mentioned only in prose");
    expect(
      hasPublicIntentEvidence(adoption, "jgengine-gameplay", "@jgengine/core/game/createThing", "createThing", 1),
    ).toBe(true);
  });

  test("curated barrels do not duplicate the underlying declaration gate", () => {
    expect(isCanonicalDeclarationImport("@jgengine/core/world")).toBe(false);
    expect(isCanonicalDeclarationImport("@jgengine/core/world/roads")).toBe(true);
  });
});
