import { useEffect } from "@jgengine/core/ui/jsx";

import { KitButton } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { RouteLoadingScreen } from "../components/RouteLoadingScreen";
import { loadGameSessionModule } from "../runtime/gameRoutePreload";
import { useGameCreateEntry } from "../runtime/gameCreate";

export function GameCreateScreen() {
  const { phase, error, retry } = useGameCreateEntry();

  useEffect(() => {
    void loadGameSessionModule();
  }, []);

  if (error !== null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a100e] px-6 text-center text-brand-cream">
        <p className="max-w-md text-sm text-[#f0a097]">{error}</p>
        <KitButton type="button" variant="primary" onClick={retry}>
          Try again
        </KitButton>
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