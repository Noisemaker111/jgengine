/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect } from "@jgengine/core/ui/jsx";

import { useGamePhase } from "@jgengine/core/ui/hooks.view";

export function GamePhaseStamp() {
  const { phase } = useGamePhase();
  useEffect(() => {
    document.documentElement.dataset["jgPhase"] = phase;
  }, [phase]);
  return null;
}
