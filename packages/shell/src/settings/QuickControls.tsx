import { useState, type ReactNode } from "react";

import type { SettingsCategoryView, SettingsController, SettingsRow } from "./settingsController";

function QuickSlider({ row }: { row: SettingsRow }) {
  const value = Number(row.value);
  const readout = row.format?.(value) ?? String(value);
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-300">
      <span className="w-16 shrink-0 truncate">{row.label}</span>
      <input
        type="range"
        min={row.min}
        max={row.max}
        step={row.step}
        value={value}
        aria-label={row.label}
        className="h-1.5 flex-1 cursor-pointer accent-emerald-400"
        onChange={(event) => row.set(Number(event.target.value))}
      />
      <span className="w-9 shrink-0 text-right tabular-nums text-neutral-100">{readout}</span>
    </label>
  );
}

function QuickToggle({ row }: { row: SettingsRow }) {
  const on = Boolean(row.value);
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-neutral-300">
      <span className="truncate">{row.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={row.label}
        onClick={() => row.set(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full ring-1 transition ${
          on ? "bg-emerald-500 ring-emerald-400" : "bg-neutral-700 ring-white/10"
        }`}
      >
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}

function QuickSelect({ row }: { row: SettingsRow }) {
  const options = row.options ?? [];
  const current = String(row.value);
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-neutral-300">
      <span className="truncate">{row.label}</span>
      <div className="flex shrink-0 gap-1 rounded-md bg-neutral-950/60 p-0.5 ring-1 ring-white/10">
        {options.map((option) => {
          const selected = option.value === current;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => row.set(option.value)}
              className={`rounded px-2 py-1 font-medium transition ${
                selected ? "bg-emerald-500 text-neutral-950" : "text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuickRow({ row }: { row: SettingsRow }) {
  if (row.kind === "slider") return <QuickSlider row={row} />;
  if (row.kind === "toggle") return <QuickToggle row={row} />;
  return <QuickSelect row={row} />;
}

function Popover({ children }: { children: ReactNode }) {
  return (
    <div className="absolute bottom-12 left-0 w-64 space-y-2.5 rounded-lg bg-neutral-950/90 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-sm">
      {children}
    </div>
  );
}

function QuickButton({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={open}
      className={`flex h-11 w-11 items-center justify-center rounded-md text-lg shadow-lg ring-1 backdrop-blur-sm transition ${
        open ? "bg-emerald-500/20 text-emerald-300 ring-emerald-400/50" : "bg-neutral-950/75 text-neutral-200 ring-white/10 hover:bg-neutral-900/80"
      }`}
    >
      {children}
    </button>
  );
}

export function QuickControls({ controller }: { controller: SettingsController }) {
  const [open, setOpen] = useState<"volume" | "graphics" | null>(null);
  const byId = (id: string): SettingsCategoryView | undefined =>
    controller.categories.find((category) => category.id === id);
  const sound = byId("sound");
  const graphics = byId("graphics");
  if (sound === undefined && graphics === undefined) return null;

  const toggle = (which: "volume" | "graphics") => setOpen((current) => (current === which ? null : which));

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-30 flex items-end gap-2">
      {sound !== undefined ? (
        <div className="relative">
          {open === "volume" ? (
            <Popover>
              {sound.rows.map((row) => (
                <QuickRow key={row.id} row={row} />
              ))}
            </Popover>
          ) : null}
          <QuickButton label="Volume" open={open === "volume"} onToggle={() => toggle("volume")}>
            <span aria-hidden>🔊</span>
          </QuickButton>
        </div>
      ) : null}
      {graphics !== undefined ? (
        <div className="relative">
          {open === "graphics" ? (
            <Popover>
              {graphics.rows.map((row) => (
                <QuickRow key={row.id} row={row} />
              ))}
            </Popover>
          ) : null}
          <QuickButton label="Graphics" open={open === "graphics"} onToggle={() => toggle("graphics")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3a9 9 0 0 0 0 18M3 12h18M5 6c2 1.5 5 2.5 7 2.5S17 7.5 19 6M5 18c2-1.5 5-2.5 7-2.5s5 1 7 2.5" />
            </svg>
          </QuickButton>
        </div>
      ) : null}
    </div>
  );
}
