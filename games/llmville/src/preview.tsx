/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "@jgengine/core/ui/jsx";

import { LlmvilleApp } from "./app";
import { queryAddress, screenRouter } from "./screens/screenRouter";

/**
 * LLMville's screens in the dev runner. `?game=llmville&preview` is the whole site, with the
 * screen it is on kept in `&screen=` (`&screen=/login`). The screens draw on LLMville's one native
 * surface, which fills the viewport, so the runner's frame needs no page wrapper.
 */
export default function Preview() {
  useState(() => screenRouter.install(queryAddress()));
  return <LlmvilleApp />;
}
