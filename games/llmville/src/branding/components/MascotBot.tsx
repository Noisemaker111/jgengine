import { cn } from "@/components/ui/cn";
import { SITE_NAME } from "@/seo/siteSeo";

interface MascotBotProps {
  className?: string;
  /** Pixel size of the square logo mark. Defaults to 40. */
  size?: number;
  title?: string;
}

/**
 * LLMville mascot — a friendly rounded "tiny mind" bot.
 * Cozy, vinyl-toy styling with antenna nubs and soft eyes.
 * Uses currentColor so it can be tinted (cream on dark, teal accent, etc.).
 */
export function MascotBot({ className, size = 40, title = SITE_NAME }: MascotBotProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={title}
      className={cn("text-brand-cream", className)}
    >
      <title>{title}</title>
      {/* antenna nubs */}
      <circle cx="16" cy="7" r="3" fill="currentColor" />
      <circle cx="32" cy="7" r="3" fill="currentColor" />
      <path d="M16 9.5V13M32 9.5V13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* head / body capsule */}
      <rect x="8" y="12" width="32" height="28" rx="11" fill="currentColor" />
      {/* face screen */}
      <rect x="14" y="18" width="20" height="14" rx="7" fill="var(--brand-ink)" />
      {/* eyes */}
      <circle cx="20.5" cy="25" r="2.4" fill="var(--brand-teal)" />
      <circle cx="27.5" cy="25" r="2.4" fill="var(--brand-teal)" />
      {/* smile */}
      <path
        d="M20.5 28.5c1.4 1.3 5.6 1.3 7 0"
        stroke="var(--brand-teal)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
