import { cn } from "@/components/ui/cn";

const PARTICLES = [
  { left: "8%", top: "22%", delay: "0s", size: 4 },
  { left: "18%", top: "68%", delay: "1.2s", size: 3 },
  { left: "72%", top: "18%", delay: "0.6s", size: 5 },
  { left: "84%", top: "55%", delay: "2s", size: 3 },
  { left: "46%", top: "78%", delay: "1.6s", size: 4 },
  { left: "58%", top: "32%", delay: "0.3s", size: 3 },
] as const;

const TICKER_ITEMS = [
  "TFLOP pool online",
  "inference queue idle",
  "garage tier unlocked",
  "co-op sync ready",
  "tokenizer warm",
  "cooling nominal",
] as const;

/** Ambient motion layer for the main menu — CSS only, respects reduced motion. */
export function MainMenuAtmosphere({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      <div className="main-menu-scanline absolute inset-x-0 top-0 h-24 opacity-30" />

      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className="main-menu-particle absolute rounded-full bg-brand-teal/50 shadow-[0_0_12px_rgba(95,194,168,0.45)]"
          style={{
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            animationDelay: particle.delay,
          }}
        />
      ))}

      <div className="main-menu-ticker absolute bottom-[4.5rem] left-0 right-0 hidden overflow-hidden sm:block">
        <div className="main-menu-ticker-track flex w-max gap-8 px-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-teal/35">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, index) => (
            <span key={index} className="shrink-0">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
