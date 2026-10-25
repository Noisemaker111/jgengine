import { cn } from "@/components/ui/cn";
import { GRAPHICS_QUALITY_OPTIONS, useAppSettings } from "@/settings/settings";

import { KeybindSettingsControls } from "@/settings/components/KeybindSettingsControls";

interface AppSettingsControlsProps {
  compact?: boolean;
  /** General tab: accessibility toggles only */
  generalOnly?: boolean;
  /** Video tab: graphics preset only */
  videoOnly?: boolean;
  /** Keybinds tab: remapping only */
  keybindsOnly?: boolean;
}

export function AppSettingsControls({
  compact = false,
  generalOnly = false,
  videoOnly = false,
  keybindsOnly = false,
}: AppSettingsControlsProps) {
  const { reducedMotion, setReducedMotion, graphicsQuality, setGraphicsQuality } = useAppSettings();
  const activeGraphicsMode = GRAPHICS_QUALITY_OPTIONS.find((option) => option.id === graphicsQuality) ?? GRAPHICS_QUALITY_OPTIONS[1];

  const showReducedMotion = generalOnly || (!videoOnly && !keybindsOnly);
  const showGraphics = videoOnly || (!generalOnly && !keybindsOnly);
  const showKeybinds = keybindsOnly || (!generalOnly && !videoOnly);

  return (
    <div className={cn(compact ? "space-y-4" : "space-y-6")}>
      {!compact && !videoOnly && !keybindsOnly && !generalOnly && (
        <h2 className="font-game text-base font-bold text-brand-cream">App settings</h2>
      )}

      {(showReducedMotion || showGraphics) && (
        <div className="rounded-xl border border-white/8 bg-black/20 divide-y divide-white/8">
          {showReducedMotion && (
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <p className={cn("font-semibold text-white", compact ? "text-xs" : "text-sm")}>Reduced Motion</p>
                <p className={cn("mt-0.5 text-white/50", compact ? "text-[10px] leading-4" : "text-xs")}>
                  Minimize animations and transitions.
                </p>
              </div>
              <button
                type="button"
                aria-pressed={reducedMotion}
                onClick={() => setReducedMotion(!reducedMotion)}
                className={cn(
                  "relative flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                  reducedMotion ? "border-brand-teal/50 bg-brand-teal/20" : "border-[var(--surface-border)] bg-[#0f1715]/70",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-transform",
                    reducedMotion ? "translate-x-5.5" : "translate-x-1",
                  )}
                />
                <span className="sr-only">Toggle reduced motion</span>
              </button>
            </div>
          )}

          {showGraphics && (
            <div className={cn("px-4", compact ? "py-3" : "py-3.5")}>
              <div className="min-w-0">
                <p className={cn("font-semibold text-white", compact ? "text-xs" : "text-sm")}>Graphics Preset</p>
                <p className={cn("mt-0.5 text-white/50", compact ? "text-[10px] leading-4" : "text-xs")}>
                  {activeGraphicsMode.description}
                </p>
              </div>
              <div className={cn("grid grid-cols-3 gap-2", compact ? "mt-2.5" : "mt-3")}>
                {GRAPHICS_QUALITY_OPTIONS.map((option) => {
                  const active = option.id === graphicsQuality;
                  return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setGraphicsQuality(option.id)}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-center font-game transition-all",
                        compact ? "text-[10px]" : "text-xs",
                        active
                          ? "border-brand-teal/50 bg-brand-teal/15 text-brand-cream shadow-[var(--glow-teal)]"
                          : "border-[var(--surface-border)] bg-black/20 text-brand-cream/50 hover:border-[var(--surface-border-strong)] hover:text-brand-cream/80",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showKeybinds && <KeybindSettingsControls compact={compact} />}
    </div>
  );
}
