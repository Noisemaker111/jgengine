import { describe, expect, test } from "bun:test";

import { componentInstallUrl } from "./registry";
import { componentWiringSnippet, iconWiringSnippet, materialWiringSnippet, modelWiringSnippet } from "./snippet";

describe("componentInstallUrl", () => {
  test("builds the shadcn registry url", () => {
    expect(componentInstallUrl("vital-bar")).toBe("https://jgengine.com/r/vital-bar.json");
  });
});

describe("wiring snippets", () => {
  test("model snippet resolves the id through buildCatalog", () => {
    const snippet = modelWiringSnippet("quaternius-modular-scifi/astronautA", { seam: "entityModels" });
    expect(snippet).toContain("buildCatalog");
    expect(snippet).toContain("quaternius-modular-scifi/astronautA");
    expect(snippet).toContain("entityModels");
  });

  test("component snippet emits the install command and a PascalCase symbol", () => {
    const snippet = componentWiringSnippet({ name: "vital-bar", title: "Vital Bar", description: "hp/mana bar" });
    expect(snippet).toContain("npx shadcn@latest add https://jgengine.com/r/vital-bar.json");
    expect(snippet).toContain("VitalBar");
  });

  test("icon snippet points at the game-icon catalog", () => {
    const snippet = iconWiringSnippet("sword");
    expect(snippet).toContain("game-icon");
    expect(snippet).toContain("GameIcon");
    expect(snippet).toContain('"sword"');
  });

  test("material snippet resolves the catalog and wires both the terrain and model texture seams", () => {
    const snippet = materialWiringSnippet("material/grass");
    expect(snippet).toContain("buildMaterialCatalog");
    expect(snippet).toContain("material/grass");
    expect(snippet).toContain("terrain({ detail: { material:");
    expect(snippet).toContain("material: { maps: material.maps }");
  });
});
