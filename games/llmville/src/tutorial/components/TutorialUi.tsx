import { Html } from "@react-three/drei";

import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import type { PlacedRack } from "@/infrastructure/infrastructure";
import type { TutorialHint } from "@/tutorial/tutorialRuntime";
import { useAnimatedText } from "@/tutorial/tutorialRuntime";

export function TutorialArrow({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute left-1/2 top-[-2rem] z-50 flex -translate-x-1/2 flex-col items-center animate-bounce", className)}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="filter drop-shadow-[0_0_8px_rgba(95,194,168,0.65)]"
      >
        <path
          d="M12 4V20M12 20L6 14M12 20L18 14"
          stroke="#5fc2a8"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function TutorialRackArrow({ rack, show }: { rack: PlacedRack | null; show: boolean }) {
  if (!show || rack === null) return null;

  return (
    <Html
      position={[rack.x, 1.6, rack.z]}
      center
      pointerEvents="none"
      style={{ pointerEvents: "none", transform: "translate(-50%, 0)" }}
    >
      <div className="flex flex-col items-center drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          className="text-brand-teal"
          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}
        >
          <path
            d="M12 4v16m0 0l-6-6m6 6l6-6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Html>
  );
}

export function TutorialObjective({
  hint,
  isTouch = false,
  className,
}: {
  hint: TutorialHint;
  isTouch?: boolean;
  className?: string;
}) {
  const { displayed, exiting, isTransitioning } = useAnimatedText(hint.text);
  const cardBodyClassName = "flex w-full flex-col gap-1";

  return (
    <Card
      variant="quest-ticket"
      decoration="pin"
      data-ui-layer="tutorial-objective"
      className={cn("pointer-events-none w-[min(16rem,calc(100vw-2rem))]", className)}
    >
      <div className="relative min-h-[3.25rem] w-full overflow-hidden">
        {exiting !== null && (
          <div
            key={`exit-${exiting}`}
            className={cn(cardBodyClassName, "absolute inset-0 animate-out slide-out-to-left duration-300")}
          >
            <span className="text-[10px] font-semibold text-[#6b5c4a]/80">Current objective</span>
            <p className="font-game text-sm font-bold leading-snug text-[#2d2416]">{exiting}</p>
          </div>
        )}
        <div
          key={isTransitioning ? `enter-${displayed}` : "current"}
          className={cn(
            cardBodyClassName,
            isTransitioning
              ? "absolute inset-0 animate-in slide-in-from-right-4 duration-300 delay-300"
              : "animate-in slide-in-from-left duration-500",
          )}
        >
          <span className="text-[10px] font-semibold text-[#6b5c4a]/80">Current objective</span>
          <p
            className={cn(
              "font-game font-bold leading-snug text-[#2d2416] break-words",
              isTouch ? "text-sm" : "text-[15px]",
            )}
          >
            {displayed}
          </p>
        </div>
      </div>
    </Card>
  );
}
