import { FloodMap } from "./components/FloodMap";
import { LoseScreen } from "./components/LoseScreen";
import { PackageCard } from "./components/PackageCard";
import { StaminaBar } from "./components/StaminaBar";
import { StartScreen } from "./components/StartScreen";
import { TideClock } from "./components/TideClock";
import { Toasts } from "./components/Toasts";
import { WinScreen } from "./components/WinScreen";

export function GameUI() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-5">
      <div className="flex flex-col items-center gap-2">
        <div className="flex w-full items-start justify-center gap-3">
          <div className="flex-1" />
          <TideClock />
          <div className="flex flex-1 justify-end">
            <FloodMap />
          </div>
        </div>
        <Toasts />
      </div>

      <div className="flex items-end justify-between gap-3">
        <PackageCard />
        <StaminaBar />
      </div>

      <StartScreen />
      <WinScreen />
      <LoseScreen />
    </div>
  );
}
