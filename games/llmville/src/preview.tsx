import { useState } from "@jgengine/core/ui/jsx";

import { LlmvilleApp } from "./app";
import { memoryAddress, queryAddress, screenRouter, type ScreenAddress } from "./screens/screenRouter";

/**
 * LLMville's screens in the dev runner. `?game=llmville&preview` is the whole site, with the
 * screen it is on kept in `&screen=` (`&screen=/login`); a named state opens one dev screen.
 */
function ScreensAt({ address, className }: { address: () => ScreenAddress; className?: string | undefined }) {
  useState(() => screenRouter.install(address()));
  return (
    <div className={className}>
      <LlmvilleApp />
    </div>
  );
}

const at = (path: string) =>
  function PreviewScreen({ className }: { className?: string }) {
    return <ScreensAt address={() => memoryAddress(path)} className={className} />;
  };

export default function Preview({ className }: { className?: string }) {
  return <ScreensAt address={() => queryAddress()} className={className} />;
}

export const states = {
  workbench: at("/dev"),
  racks: at("/dev/racks"),
  character: at("/dev/character"),
  hud: at("/dev/hud"),
  bills: at("/dev/bills"),
};
