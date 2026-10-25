import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { RouteLoadingScreen } from "@/components/RouteLoadingScreen";
import { loadGameSessionModule } from "@/runtime/gameRoutePreload";
import { useGameCreateEntry } from "@/runtime/gameCreate";

export const Route = createFileRoute("/game/create")({
  component: GameCreateRoute,
});

function GameCreateRoute() {
  const { phase, error, retry } = useGameCreateEntry();

  useEffect(() => {
    void loadGameSessionModule();
  }, []);

  if (error !== null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a100e] px-6 text-center text-brand-cream">
        <p className="max-w-md text-sm text-[#f0a097]">{error}</p>
        <Button type="button" variant="primary" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const label =
    phase === "bootstrapping"
      ? "Creating your lab"
      : phase === "redirecting"
        ? "Joining world"
        : "Setting up your lab";

  return <RouteLoadingScreen label={label} />;
}