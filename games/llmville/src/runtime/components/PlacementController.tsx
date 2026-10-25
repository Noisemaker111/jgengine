import { TerritoryOverlay } from "@jgengine/shell/TerritoryOverlay";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface PlacementControllerProps {
  onRotate: () => void;
  onPlace: () => void;
  canPlace: boolean;
  facingLabel: string;
  claimHint: Pick<Parameters<typeof TerritoryOverlay>[0], "cells" | "cost" | "affordable"> | null;
  isTouch?: boolean;
}

export default function PlacementController({
  onRotate,
  onPlace,
  canPlace,
  facingLabel,
  claimHint,
  isTouch = false,
}: PlacementControllerProps) {
  return (
    <Card variant="sticky-note" decoration="tape" className="p-3">
      <div className="mb-3 flex items-center gap-2">
        <svg className="h-4 w-4 text-[#3c8c76]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <h3 className="text-sm font-bold text-[#2d2416]">Placement</h3>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onRotate} className="game-btn--compact flex-1 text-xs text-[#2d2416]">
            Rotate {isTouch ? "" : "(R)"}
          </Button>
          <span className="min-w-[72px] text-right font-mono text-sm text-[#3c8c76]">
            {facingLabel}
          </span>
        </div>
        {claimHint !== null && (
          <TerritoryOverlay {...claimHint} className="text-[11px] font-medium text-[#7a6a53]" formatCost={(cost) => `$${cost.toLocaleString()}`} />
        )}
        <Button
          variant="primary"
          onClick={onPlace}
          disabled={!canPlace}
          className="w-full game-btn--compact text-xs disabled:opacity-40"
        >
          {isTouch ? "Place" : "Place (E or click)"}
        </Button>
      </div>
    </Card>
  );
}
