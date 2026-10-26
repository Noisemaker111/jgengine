import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createSaveStore, memorySaveBackend } from "@jgengine/core/save/saveStore";

import { useSaveStore } from "./saveStore.view";

describe("useSaveStore", () => {
  test("renders the live value and status from the store", () => {
    const store = createSaveStore({ backend: memorySaveBackend(), initial: { coins: 3 } });
    store.set({ coins: 8 });

    function Readout() {
      const save = useSaveStore(store, { load: false });
      return createElement("span", null, `${save.value.coins}:${save.status}:${save.slot}`);
    }

    const html = renderToStaticMarkup(createElement(Readout));
    expect(html).toContain("8:idle:default");
  });
});
