import { ChargeMeter } from "@/components/ui/charge-meter";
import { KeybindBadge } from "@/components/ui/keybind-badge";

export function PadChargeOverlay({ chargeFraction }: { chargeFraction: number }) {
  return (
    <div
      className="pointer-events-none flex flex-col items-center gap-2 rounded px-6 py-4"
      style={{
        background: "linear-gradient(180deg, rgba(32,36,43,0.92) 0%, rgba(20,23,27,0.95) 100%)",
        border: "1px solid var(--jg-accent)",
        boxShadow: "0 0 24px var(--jg-accent-glow)",
      }}
      data-jg="pad-charge-overlay"
    >
      <span
        className="text-[11px] font-bold uppercase tracking-[0.24em]"
        style={{ color: "var(--jg-accent)", textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}
      >
        Charging — {Math.round(chargeFraction * 100)}%
      </span>
      <ChargeMeter fraction={chargeFraction} ready={chargeFraction >= 1} width={220} />
      <div className="flex items-center gap-2">
        <KeybindBadge label="E" size="sm" />
        <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--jg-text-dim)" }}>
          lift off
        </span>
        <span className="ml-3 text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--jg-warning)" }}>
          clock still running
        </span>
      </div>
    </div>
  );
}
