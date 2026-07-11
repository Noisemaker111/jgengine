import { useEffect, useState, type ReactNode } from "react";

import {
  type KeybindRow,
  type SettingsCategoryView,
  type SettingsController,
  type SettingsRow,
} from "./settingsController";

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close settings"
      className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-400 ring-1 ring-white/10 transition hover:bg-neutral-800 hover:text-white"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function TabStrip({
  categories,
  active,
  onSelect,
}: {
  categories: SettingsCategoryView[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((category) => {
        const selected = category.id === active;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className={`min-h-[44px] rounded-md px-3.5 text-sm font-medium transition ${
              selected
                ? "bg-emerald-500 text-neutral-950 ring-1 ring-emerald-400"
                : "bg-neutral-900/70 text-neutral-300 ring-1 ring-white/10 hover:bg-neutral-800"
            }`}
          >
            {category.label}
          </button>
        );
      })}
    </div>
  );
}

function RowShell({ label, control }: { label: string; control: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-neutral-900/60 px-3 py-2.5 ring-1 ring-white/10">
      <span className="text-sm text-neutral-200">{label}</span>
      {control}
    </div>
  );
}

function SliderRow({ row }: { row: SettingsRow }) {
  const value = Number(row.value);
  const readout = row.format?.(value) ?? String(value);
  return (
    <RowShell
      label={row.label}
      control={
        <div className="flex flex-1 items-center gap-3 pl-4">
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
          <span className="w-12 shrink-0 text-right text-sm tabular-nums text-neutral-100">{readout}</span>
        </div>
      }
    />
  );
}

function ToggleRow({ row }: { row: SettingsRow }) {
  const on = Boolean(row.value);
  return (
    <RowShell
      label={row.label}
      control={
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={row.label}
          onClick={() => row.set(!on)}
          className={`relative h-7 w-12 shrink-0 rounded-full ring-1 transition ${
            on ? "bg-emerald-500 ring-emerald-400" : "bg-neutral-700 ring-white/10"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`}
          />
        </button>
      }
    />
  );
}

function SelectRow({ row }: { row: SettingsRow }) {
  const options = row.options ?? [];
  const current = String(row.value);
  return (
    <RowShell
      label={row.label}
      control={
        <div className="flex shrink-0 gap-1 rounded-md bg-neutral-950/60 p-1 ring-1 ring-white/10">
          {options.map((option) => {
            const selected = option.value === current;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => row.set(option.value)}
                className={`min-h-[36px] rounded px-3 text-sm font-medium transition ${
                  selected ? "bg-emerald-500 text-neutral-950" : "text-neutral-300 hover:bg-neutral-800"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      }
    />
  );
}

function RowControl({ row }: { row: SettingsRow }) {
  if (row.kind === "slider") return <SliderRow row={row} />;
  if (row.kind === "toggle") return <ToggleRow row={row} />;
  return <SelectRow row={row} />;
}

function KeybindRowView({
  row,
  capturing,
  onCapture,
}: {
  row: KeybindRow;
  capturing: boolean;
  onCapture: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900/60 px-3 py-2.5 ring-1 ring-white/10">
      <span className="text-sm text-neutral-200">{row.label}</span>
      <div className="flex shrink-0 items-center gap-2">
        <span
          title={capturing ? "Press a key or mouse button — Esc to cancel" : undefined}
          className={`inline-flex min-h-[32px] min-w-[3.5rem] items-center justify-center rounded-md px-2 font-mono text-sm ring-1 ${
            capturing
              ? "animate-pulse bg-emerald-500/15 text-emerald-300 ring-emerald-400/50"
              : "bg-neutral-950/70 text-neutral-100 ring-white/10"
          }`}
        >
          {capturing ? "Press key…" : row.bindingLabel}
        </span>
        <button
          type="button"
          onClick={onCapture}
          disabled={capturing}
          className="min-h-[36px] rounded-md bg-neutral-800 px-3 text-sm font-medium text-neutral-200 ring-1 ring-white/10 transition hover:bg-neutral-700 disabled:opacity-40"
        >
          Rebind
        </button>
        <button
          type="button"
          disabled={row.isDefault}
          onClick={() => row.reset()}
          className="min-h-[36px] rounded-md px-2.5 text-sm text-neutral-400 ring-1 ring-white/10 transition hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export function SettingsMenu({ controller, onClose }: { controller: SettingsController; onClose: () => void }) {
  const first = controller.categories[0]?.id ?? "sound";
  const [activeId, setActiveId] = useState<string>(first);
  const [capturing, setCapturing] = useState<KeybindRow | null>(null);

  const active =
    controller.categories.find((category) => category.id === activeId) ?? controller.categories[0] ?? null;

  useEffect(() => {
    if (capturing === null) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setCapturing(null);
        return;
      }
      capturing.rebind(event.code);
      setCapturing(null);
    };
    const onPointer = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      capturing.rebind(`mouse${event.button}`);
      setCapturing(null);
    };
    const onContext = (event: Event) => event.preventDefault();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("contextmenu", onContext, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("contextmenu", onContext, true);
    };
  }, [capturing]);

  const body =
    active === null ? null : (
      <>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="text-base font-semibold tracking-wide text-white">Settings</h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="border-b border-white/10 px-4 py-3">
          <TabStrip categories={controller.categories} active={active.id} onSelect={setActiveId} />
        </div>
        <div className="jg-settings-scroll flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {active.rows.map((row) => (
            <RowControl key={row.id} row={row} />
          ))}
          {active.keybinds.map((row) => (
            <KeybindRowView
              key={row.action}
              row={row}
              capturing={capturing?.action === row.action}
              onCapture={() => setCapturing(row)}
            />
          ))}
        </div>
      </>
    );

  if (controller.mode === "page") {
    return (
      <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col bg-neutral-950 text-neutral-200">
        {body}
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-3 backdrop-blur">
      <div className="pointer-events-auto flex max-h-[min(90vh,42rem)] w-full max-w-md flex-col overflow-hidden rounded-xl bg-neutral-950/90 text-neutral-200 shadow-2xl ring-1 ring-white/10 backdrop-blur-sm">
        {body}
      </div>
    </div>
  );
}
