/** @jsxImportSource @jgengine/core/ui/jsx */
import { afterEach, describe, expect, test } from "bun:test";
import type { ReactNode } from "@jgengine/core/ui/jsx";

import { clearModelLoadFallbacks, handleModelLoadFailure } from "@jgengine/core/model/modelLoad.draw";
import { MissingModelsNotice } from "./MissingModelsNotice.draw";

import { renderToStaticMarkup } from "@jgengine/core/ui/jsx/markup";

async function fail(url: string): Promise<void> {
  await handleModelLoadFailure(url, new Error("404"), () => undefined, () => undefined, {
    probe: async () => ({ kind: "missing", ok: false, url, message: "404" }),
    warn: () => undefined,
  });
}

describe("MissingModelsNotice", () => {
  afterEach(() => clearModelLoadFallbacks());

  test("draws nothing while every model loaded", () => {
    expect(renderToStaticMarkup(<MissingModelsNotice />)).toBe("");
  });

  test("names each model that became a placeholder box", async () => {
    await fail("/models/pack/Crate.glb");
    await fail("/models/library/creature/dog-shepherd/model.glb");
    const html = renderToStaticMarkup(<MissingModelsNotice />);
    expect(html).toContain("2 MODELS MISSING");
    expect(html).toContain("pack/Crate");
    expect(html).toContain("creature/dog-shepherd");
  });

  test("never draws in a production build", async () => {
    await fail("/models/pack/Crate.glb");
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(renderToStaticMarkup(<MissingModelsNotice />)).toBe("");
    } finally {
      process.env.NODE_ENV = before;
    }
    expect(renderToStaticMarkup(<MissingModelsNotice />)).toContain("1 MODEL MISSING");
  });
});
