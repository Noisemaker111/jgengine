import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import {
  type SettingsActionView,
  type SettingsCategoryView,
  type SettingsController,
  type SettingsKeybindRow,
  type SettingsRow,
} from "./settingsController";

const surface = "var(--jg-surface, #16161d)";
const surfaceDeep = "var(--jg-surface-deep, #0b0b11)";
const edge = "var(--jg-edge, #2b2b35)";
const text = "var(--jg-text, #ececef)";
const textDim = "var(--jg-text-dim, #9494a0)";
const accent = "var(--jg-accent, #6ee7a8)";
const accentGlow = "var(--jg-accent-glow, rgba(110,231,168,0.35))";
const onAccent = "var(--jg-surface-deep, #0b0b0f)";
const danger = "var(--jg-danger, #e0574e)";
const fontDisplay = "var(--jg-font-display, inherit)";

const rowStyle: CSSProperties = { background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" };
const badgeStyle: CSSProperties = { background: surfaceDeep, border: "1px solid rgba(255,255,255,0.12)", color: text };

interface Tab {
  id: string;
  label: string;
  category: SettingsCategoryView | null;
}

function GlyphClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function GlyphReset() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close settings"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10"
      style={{ color: textDim, border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <GlyphClose />
    </button>
  );
}

function RowShell({ label, control }: { label: string; control: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl px-3.5 py-3" style={rowStyle}>
      <span className="text-sm" style={{ color: text }}>
        {label}
      </span>
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
            className="h-1.5 flex-1 cursor-pointer"
            style={{ accentColor: accent }}
            onChange={(event) => row.set(Number(event.target.value))}
          />
          <span className="w-12 shrink-0 text-right text-sm tabular-nums" style={{ color: text }}>
            {readout}
          </span>
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
          className="relative h-7 w-12 shrink-0 rounded-full transition"
          style={{ background: on ? accent : "rgba(255,255,255,0.16)", boxShadow: on ? `0 0 12px ${accentGlow}` : "none" }}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
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
        <div className="flex shrink-0 gap-1 rounded-lg p-1" style={{ background: surfaceDeep }}>
          {options.map((option) => {
            const selected = option.value === current;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => row.set(option.value)}
                className="min-h-[34px] rounded-md px-3 text-sm font-medium transition"
                style={selected ? { background: accent, color: onAccent } : { color: textDim }}
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
  row: SettingsKeybindRow;
  capturing: boolean;
  onCapture: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3" style={rowStyle}>
      <span className="text-sm" style={{ color: text }}>
        {row.label}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onCapture}
          disabled={capturing}
          title="Click to rebind — Esc to cancel"
          className="inline-flex min-h-[34px] min-w-[3.75rem] items-center justify-center rounded-lg px-3 font-mono text-sm transition hover:brightness-125"
          style={
            capturing
              ? { background: accentGlow, color: accent, border: `1px solid ${accent}` }
              : badgeStyle
          }
        >
          {capturing ? "Press…" : row.bindingLabel}
        </button>
        <button
          type="button"
          onClick={() => row.reset()}
          aria-label={`Reset ${row.label}`}
          title="Reset to default"
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/10 ${row.isDefault ? "invisible" : ""}`}
          style={{ color: textDim }}
        >
          <GlyphReset />
        </button>
      </div>
    </div>
  );
}

function ActionRow({ action, onClose }: { action: SettingsActionView; onClose: () => void }) {
  const isDanger = action.kind === "danger";
  return (
    <button
      type="button"
      onClick={() => {
        action.run();
        onClose();
      }}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition hover:brightness-110"
      style={{
        background: isDanger ? "rgba(224,87,78,0.12)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${isDanger ? danger : "rgba(255,255,255,0.1)"}`,
      }}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold" style={{ color: isDanger ? danger : text }}>
          {action.label}
        </span>
        {action.description !== undefined ? (
          <span className="text-xs" style={{ color: textDim }}>
            {action.description}
          </span>
        ) : null}
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" style={{ color: isDanger ? danger : textDim }} aria-hidden>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

function TabButton({ tab, selected, orientation, onSelect }: { tab: Tab; selected: boolean; orientation: "row" | "col"; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-h-[40px] whitespace-nowrap rounded-lg px-4 text-sm font-medium transition ${orientation === "col" ? "w-full text-left" : ""} ${selected ? "" : "hover:bg-white/5"}`}
      style={selected ? { background: accent, color: onAccent } : { color: textDim }}
    >
      {tab.label}
    </button>
  );
}

function Body({ tab, actions, capturing, setCapturing, onClose }: BodyProps) {
  return (
    <div className="jg-settings-scroll flex-1 space-y-2 overflow-y-auto p-4">
      {tab.category === null
        ? actions.map((action) => <ActionRow key={action.id} action={action} onClose={onClose} />)
        : (
          <>
            {tab.category.rows.map((row) => (
              <RowControl key={row.id} row={row} />
            ))}
            {tab.category.keybinds.map((row) => (
              <KeybindRowView
                key={row.action}
                row={row}
                capturing={capturing?.action === row.action}
                onCapture={() => setCapturing(row)}
              />
            ))}
          </>
        )}
    </div>
  );
}

interface BodyProps {
  tab: Tab;
  actions: SettingsActionView[];
  capturing: SettingsKeybindRow | null;
  setCapturing: (row: SettingsKeybindRow) => void;
  onClose: () => void;
}

const panelStyle: CSSProperties = {
  background: surface,
  color: text,
  border: `1px solid ${edge}`,
  fontFamily: fontDisplay,
};

function Backdrop({ children, onClose, align }: { children: ReactNode; onClose: () => void; align: string }) {
  return (
    <div
      className={`pointer-events-auto absolute inset-0 z-40 flex justify-center bg-black/55 p-3 backdrop-blur-sm ${align}`}
      onClick={onClose}
    >
      {children}
    </div>
  );
}

function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function SettingsMenu({
  controller,
  onClose,
  initialTab,
}: {
  controller: SettingsController;
  onClose: () => void;
  initialTab?: string;
}) {
  const tabs: Tab[] = [
    ...(controller.actions.length > 0 ? [{ id: "game", label: "Game", category: null } as Tab] : []),
    ...controller.categories.map((category) => ({ id: category.id, label: category.label, category })),
  ];
  const [activeId, setActiveId] = useState<string>(
    initialTab !== undefined && tabs.some((tab) => tab.id === initialTab) ? initialTab : (tabs[0]?.id ?? ""),
  );
  const [capturing, setCapturing] = useState<SettingsKeybindRow | null>(null);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0] ?? null;

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

  useEffect(() => {
    if (capturing !== null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capturing, onClose]);

  if (active === null) return null;

  const bodyProps: BodyProps = { tab: active, actions: controller.actions, capturing, setCapturing, onClose };
  const title = (
    <h2 className="text-base font-semibold tracking-wide" style={{ color: text }}>
      Settings
    </h2>
  );

  if (controller.variant === "fullscreen") {
    return (
      <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col" style={{ background: surface, color: text, fontFamily: fontDisplay }}>
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4">
          <div className="flex items-center justify-between gap-3 pb-4 pt-6">
            <h2 className="text-2xl font-bold tracking-wide" style={{ color: text }}>
              Settings
            </h2>
            <CloseButton onClose={onClose} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-4">
            {tabs.map((tab) => (
              <TabButton key={tab.id} tab={tab} selected={tab.id === active.id} orientation="row" onSelect={() => setActiveId(tab.id)} />
            ))}
          </div>
          <Body {...bodyProps} />
        </div>
      </div>
    );
  }

  if (controller.variant === "sidebar") {
    return (
      <Backdrop onClose={onClose} align="items-center">
        <div
          onClick={stop}
          className="flex overflow-hidden rounded-2xl shadow-2xl"
          style={{ ...panelStyle, width: "min(94vw, 760px)", height: "min(84vh, 560px)" }}
        >
          <nav className="flex w-44 shrink-0 flex-col gap-1 p-3" style={{ background: surfaceDeep, borderRight: `1px solid ${edge}` }}>
            <span className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-widest" style={{ color: textDim }}>
              Settings
            </span>
            {tabs.map((tab) => (
              <TabButton key={tab.id} tab={tab} selected={tab.id === active.id} orientation="col" onSelect={() => setActiveId(tab.id)} />
            ))}
          </nav>
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${edge}` }}>
              <span className="text-sm font-semibold" style={{ color: text }}>
                {active.label}
              </span>
              <CloseButton onClose={onClose} />
            </div>
            <Body {...bodyProps} />
          </div>
        </div>
      </Backdrop>
    );
  }

  if (controller.variant === "sheet") {
    return (
      <Backdrop onClose={onClose} align="items-end">
        <div
          onClick={stop}
          className="flex flex-col overflow-hidden rounded-t-3xl shadow-2xl"
          style={{ ...panelStyle, width: "min(100%, 640px)", height: "min(84vh, 620px)" }}
        >
          <div className="flex flex-col items-center pt-2.5">
            <span className="h-1.5 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            {title}
            <CloseButton onClose={onClose} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-3">
            {tabs.map((tab) => (
              <TabButton key={tab.id} tab={tab} selected={tab.id === active.id} orientation="row" onSelect={() => setActiveId(tab.id)} />
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${edge}` }} className="flex flex-1 flex-col overflow-hidden">
            <Body {...bodyProps} />
          </div>
        </div>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose} align="items-center">
      <div
        onClick={stop}
        className="flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ ...panelStyle, width: "min(92vw, 460px)", height: "min(86vh, 580px)" }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3.5" style={{ borderBottom: `1px solid ${edge}` }}>
          {title}
          <CloseButton onClose={onClose} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-4 py-3" style={{ borderBottom: `1px solid ${edge}` }}>
          {tabs.map((tab) => (
            <TabButton key={tab.id} tab={tab} selected={tab.id === active.id} orientation="row" onSelect={() => setActiveId(tab.id)} />
          ))}
        </div>
        <Body {...bodyProps} />
      </div>
    </Backdrop>
  );
}
