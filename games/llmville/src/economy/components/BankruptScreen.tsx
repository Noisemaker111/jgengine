import { Loader2 } from "lucide-react";

import { BrandLogo } from "@/branding/components/BrandLogo";
import { DEFAULT_STARTING_MONEY } from "@llmville/game/world/worldBootstrap";

interface BankruptScreenProps {
  isDismissing: boolean;
  onDismiss: () => void;
}

export function BankruptScreen({ isDismissing, onDismiss }: BankruptScreenProps) {
  return (
    <div className="animate-in fade-in zoom-in-95 flex w-full max-w-md flex-col items-center gap-6 text-center duration-700">
      <BrandLogo variant="stacked" size="lg" />
      <div className="main-menu-panel w-full space-y-4 rounded-[var(--r-surface)] border border-brand-coral/35 bg-brand-coral/8 p-6">
        <p className="font-game text-lg font-bold text-brand-cream">Bankrupt</p>
        <p className="text-sm leading-relaxed text-brand-cream/65">
          Your lab could not cover its overhead — it was liquidated and reset. You start over with $
          {DEFAULT_STARTING_MONEY.toLocaleString()} and a fresh plot.
        </p>
        <p className="text-xs leading-relaxed text-brand-cream/50">
          Keep enough cash on hand; bills auto-deduct each cycle.
        </p>
        <button
          type="button"
          disabled={isDismissing}
          onClick={onDismiss}
          className="game-button game-button-primary game-menu-button w-full"
        >
          {isDismissing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Starting over…
            </>
          ) : (
            "Start over"
          )}
        </button>
      </div>
    </div>
  );
}
