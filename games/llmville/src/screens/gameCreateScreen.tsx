/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { RouteLoadingScreen } from "../components/RouteLoadingScreen";
import { loadGameSessionModule } from "../runtime/gameRoutePreload";
import { useGameCreateEntry } from "../runtime/gameCreate";
import { Backdrop, Button, ErrorText } from "../ui/kit";

export function GameCreateView({ phase, error, retry }: ReturnType<typeof useGameCreateEntry>) {
  if (error !== null) return <RuneView anchor="fill">
    <Backdrop />
    <RuneView anchor="center" items="center" gap={16} maxWidth={448}>
      <ErrorText size={14} align="center">{error}</ErrorText>
      <Button tone="primary" onPress={retry}>Try again</Button>
    </RuneView>
  </RuneView>;
  return <RouteLoadingScreen label={phase === "bootstrapping" ? "Creating your lab" : phase === "redirecting" ? "Joining world" : "Setting up your lab"} />;
}

export function GameCreateScreen() {
  const entry = useGameCreateEntry();
  useEffect(() => {
    void loadGameSessionModule();
  }, []);
  return <GameCreateView {...entry} />;
}
