import { cn } from "@/components/ui/cn";
import { MascotBot } from "@/branding/components/MascotBot";
import { SITE_TAGLINE } from "@/seo/siteSeo";

interface BrandLogoProps {
  className?: string;
  /** "stacked" = mark above wordmark (hero). "inline" = mark beside wordmark (chrome). */
  variant?: "stacked" | "inline";
  /** Visual scale. */
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
}

const WORDMARK_SIZE: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "text-2xl",
  md: "text-4xl",
  lg: "text-6xl md:text-7xl",
  xl: "text-7xl md:text-8xl",
};

const MARK_PX: Record<NonNullable<BrandLogoProps["size"]>, number> = {
  sm: 28,
  md: 40,
  lg: 64,
  xl: 80,
};

/** LLMville logo lockup: mascot mark + wordmark. */
export function BrandLogo({
  className,
  variant = "inline",
  size = "md",
  showTagline = false,
}: BrandLogoProps) {
  const stacked = variant === "stacked";

  return (
    <div
      className={cn(
        "flex select-none",
        stacked ? "flex-col items-center text-center gap-3" : "flex-row items-center gap-3",
        className,
      )}
    >
      <MascotBot size={MARK_PX[size]} className="shrink-0 drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
      <div className={cn("flex flex-col", stacked ? "items-center" : "items-start")}>
        <span className={cn("game-title leading-none", WORDMARK_SIZE[size])}>LLMville</span>
        {showTagline && (
          <span className="mt-2 font-sans text-sm font-medium text-brand-cream/70">
            {SITE_TAGLINE}
          </span>
        )}
      </div>
    </div>
  );
}
