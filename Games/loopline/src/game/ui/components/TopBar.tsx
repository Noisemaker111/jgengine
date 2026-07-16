import { balance } from "@jgengine/core/economy/wallet";
import { useGame, useGameStore } from "@jgengine/react/hooks";

import { CASH, MILESTONES, guestCap } from "../../catalog";
import { session } from "../../session";

function Chip({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/85 px-3 py-1.5 shadow-lg backdrop-blur">
      <span className="text-lg leading-none">{icon}</span>
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <span className={`font-mono text-sm font-bold ${tone ?? "text-slate-100"}`}>{value}</span>
      </div>
    </div>
  );
}

function nextMilestone(rating: number): { rating: number; label: string } | null {
  for (const m of MILESTONES) if (rating < m.rating) return m;
  return null;
}

export function TopBar() {
  const cash = useGameStore(() => balance(session.wallet, CASH));
  const rating = useGameStore(() => session.rating);
  const guests = useGameStore(() => session.guests.size);
  const happiness = useGameStore(() => session.happinessAvg);
  const litter = useGameStore(() => session.litter);
  const open = useGameStore(() => session.open);
  const day = useGameStore(() => session.day);
  const ticket = useGameStore(() => session.ticketPrice);
  const calendar = useGameStore((ctx) => ctx.time.calendar());
  const { commands } = useGame();

  const cap = guestCap(rating);
  const next = nextMilestone(rating);
  const clock = `${String(calendar.hour).padStart(2, "0")}:${String(calendar.minute).padStart(2, "0")}`;
  const cleanliness = Math.round(100 - litter);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Chip
          icon="💰"
          label="Cash"
          value={`$${Math.round(cash).toLocaleString()}`}
          tone={cash < 0 ? "text-rose-400" : cash < 500 ? "text-amber-300" : "text-emerald-300"}
        />
        <Chip icon="⭐" label="Rating" value={`${Math.round(rating)}`} tone="text-amber-300" />
        <Chip icon="🎟️" label="Guests" value={`${guests}/${cap}`} />
        <Chip
          icon={open ? "🟢" : "🌙"}
          label={`Day ${day}`}
          value={open ? `Open · ${clock}` : `Closed · ${clock}`}
          tone={open ? "text-emerald-300" : "text-slate-300"}
        />
        <Chip
          icon="😊"
          label="Happiness"
          value={`${Math.round(happiness)}%`}
          tone={happiness > 60 ? "text-emerald-300" : happiness > 35 ? "text-amber-300" : "text-rose-400"}
        />
        <Chip
          icon="✨"
          label="Clean"
          value={`${cleanliness}%`}
          tone={cleanliness > 70 ? "text-emerald-300" : cleanliness > 40 ? "text-amber-300" : "text-rose-400"}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/85 px-3 py-1.5 shadow-lg backdrop-blur">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Ticket</span>
          <button
            className="pointer-events-auto h-6 w-6 rounded bg-slate-700 text-sm font-bold text-slate-100 hover:bg-slate-600"
            onClick={() => commands.run("park.ticket", { delta: -1 })}
          >
            −
          </button>
          <span className="w-10 text-center font-mono text-sm font-bold text-amber-300">${ticket}</span>
          <button
            className="pointer-events-auto h-6 w-6 rounded bg-slate-700 text-sm font-bold text-slate-100 hover:bg-slate-600"
            onClick={() => commands.run("park.ticket", { delta: 1 })}
          >
            +
          </button>
        </div>

        {next !== null ? (
          <div className="flex min-w-[220px] flex-col gap-1 rounded-lg border border-white/10 bg-slate-900/85 px-3 py-1.5 shadow-lg backdrop-blur">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Next unlock · {next.label} @ {next.rating}
            </span>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${Math.min(100, (rating / next.rating) * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-slate-900/85 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 shadow-lg backdrop-blur">
            ★ All attractions unlocked
          </div>
        )}
      </div>
    </div>
  );
}
