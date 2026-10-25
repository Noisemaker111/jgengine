import { MascotBot } from "@/branding/components/MascotBot";
import { StandalonePageShell } from "@/branding/components/StandalonePageShell";

interface RouteLoadingScreenProps {
  label?: string;
  /** Secondary line shown under the primary label (boot step detail). */
  detail?: string;
  /** When true, fills the viewport as a fixed overlay instead of a full page shell. */
  overlay?: boolean;
  /**
   * 0..1 boot progress. When provided the bar is determinate (fills with
   * progress); when omitted it animates indeterminately. Honest by construction:
   * pass a real fraction only when you actually know it.
   */
  progress?: number;
}

export function RouteLoadingScreen({
  label = "Loading",
  detail,
  overlay = false,
  progress,
}: RouteLoadingScreenProps) {
  const pct = progress === undefined ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);

  const content = (
    <div className="flex w-full max-w-xs flex-col items-center gap-5">
      <MascotBot
        size={64}
        className="shrink-0 animate-bounce drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)] [animation-duration:1.6s]"
      />

      <div className="w-full overflow-hidden rounded-full bg-brand-cream/10" style={{ height: 6 }}>
        <div
          className={
            pct === null
              ? "h-full w-1/3 rounded-full bg-brand-teal/80 animate-loading-sweep"
              : "h-full rounded-full bg-brand-teal transition-[width] duration-500 ease-out"
          }
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-brand-cream/75">{label}</p>
        {detail ? <p className="max-w-xs text-xs text-brand-cream/45">{detail}</p> : null}
      </div>
    </div>
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink">
        {content}
      </div>
    );
  }

  return (
    <StandalonePageShell centered className="z-50">
      {content}
    </StandalonePageShell>
  );
}
