import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { ReactNode } from "react";

import { clearModelLoadFallbacks, handleModelLoadFailure } from "@jgengine/core/model/modelLoad.draw";
import { MissingModelsNotice } from "./MissingModelsNotice.draw";

const { renderToStaticMarkup } = (await import(Bun.resolveSync("react-dom/server", join(import.meta.dir, "../../../react/src")))) as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

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
});
