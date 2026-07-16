import { useEffect } from "react";

import { useGamePhase } from "@jgengine/react/hooks";

export function GamePhaseStamp() {
  const { phase } = useGamePhase();
  useEffect(() => {
    document.documentElement.dataset.jgPhase = phase;
  }, [phase]);
  return null;
}
