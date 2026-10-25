import { cn } from "@/components/ui/cn";

interface StandalonePageShellProps {
  children: React.ReactNode;
  className?: string;
  centered?: boolean;
}

/** Cozy full-screen backdrop shared by auth, profile, dashboard, and loading routes. */
export function StandalonePageShell({
  children,
  className,
  centered = false,
}: StandalonePageShellProps) {
  return (
    <div className={cn("standalone-page-shell game-bg-grid text-brand-cream", className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 min-h-full">
        <div className="absolute left-1/4 top-1/4 h-[400px] w-[400px] rounded-full bg-[#e0a95c]/8 blur-[120px] animate-pulse" />
        <div
          className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-[#5fc2a8]/8 blur-[120px] animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div className="game-perspective-grid absolute inset-0 opacity-60" />
      </div>
      <main
        className={cn(
          "relative z-10 w-full px-4 py-8 sm:px-8",
          centered
            ? "flex min-h-[100dvh] flex-col items-center justify-center"
            : "min-h-[100dvh] pb-12",
        )}
      >
        {children}
      </main>
    </div>
  );
}
