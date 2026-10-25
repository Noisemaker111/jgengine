import { MenuButton } from "@/components/ui/menu-button";

const DEATH_OVERLAY_BACKGROUND = "radial-gradient(circle, transparent 30%, rgba(90,8,8,0.55) 80%), rgba(0,0,0,0.45)";

export function DeathScreenView({
  title = "You Died",
  subtitle,
  respawnLabel = "Respawn",
  respawnKeybind,
  onRespawn,
  respawnAvailableIn,
  className,
}: {
  title?: string;
  subtitle?: string;
  respawnLabel?: string;
  respawnKeybind?: string;
  onRespawn?: () => void;
  respawnAvailableIn?: number;
  className?: string;
}) {
  const countingDown = respawnAvailableIn !== undefined && respawnAvailableIn > 0;
  return (
    <div className={`pointer-events-auto absolute inset-0 overflow-hidden ${className ?? ""}`} data-jg="death-screen">
      <div aria-hidden className="absolute inset-0" style={{ background: DEATH_OVERLAY_BACKGROUND }} />
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-6">
        <h1
          className="m-0 text-[46px] font-extrabold uppercase tracking-[0.42em]"
          style={{
            fontFamily: "var(--jg-font-display)",
            color: "var(--jg-danger)",
            textShadow: "0 4px 0 rgba(0,0,0,0.9), 0 10px 30px rgba(0,0,0,0.95)",
            animation: "jg-pop 0.9s ease-out",
          }}
        >
          {title}
        </h1>
        {subtitle !== undefined && (
          <span className="text-[13px]" style={{ color: "var(--jg-text-dim)" }}>
            {subtitle}
          </span>
        )}
        {countingDown ? (
          <span className="font-mono text-[18px] font-bold" style={{ color: "var(--jg-warning)" }}>
            {`Respawn in ${Math.ceil(respawnAvailableIn ?? 0)}s`}
          </span>
        ) : (
          <MenuButton label={respawnLabel} keybind={respawnKeybind} onActivate={onRespawn} variant="danger" />
        )}
      </div>
    </div>
  );
}
