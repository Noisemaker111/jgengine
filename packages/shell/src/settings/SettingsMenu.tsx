import { useState, type CSSProperties, type ReactNode } from "react";

import { useDialogBehavior } from "@jgengine/react/dialogBehavior";
import { ScrollRail } from "@jgengine/react/scrollRail";
import { SettingsSection } from "@jgengine/react/settingsBlocks";

import type { SettingsActionView, SettingsCategoryView, SettingsController } from "./settingsController";

const surface = "var(--jg-surface, #16161d)";
const surfaceDeep = "var(--jg-surface-deep, #0b0b11)";
const edge = "var(--jg-edge, #2b2b35)";
const text = "var(--jg-text, #ececef)";
const textDim = "var(--jg-text-dim, #9494a0)";
const accent = "var(--jg-accent, #6ee7a8)";
const onAccent = "var(--jg-surface-deep, #0b0b0f)";
const danger = "var(--jg-danger, #e0574e)";
const fontDisplay = "var(--jg-font-display, inherit)";

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
      className={`shrink-0 min-h-[44px] whitespace-nowrap rounded-lg px-4 text-sm font-medium transition ${orientation === "col" ? "w-full text-left" : ""} ${selected ? "" : "hover:bg-white/5"}`}
      style={selected ? { background: accent, color: onAccent } : { color: textDim }}
    >
      {tab.label}
    </button>
  );
}

interface BodyProps {
  tab: Tab;
  actions: SettingsActionView[];
  onClose: () => void;
}

function Body({ tab, actions, onClose }: BodyProps) {
  return (
    <div className="jg-settings-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
      {tab.category === null
        ? actions.map((action) => <ActionRow key={action.id} action={action} onClose={onClose} />)
        : <SettingsSection category={tab.category} heading={false} />}
    </div>
  );
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
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0] ?? null;
  const dialogRef = useDialogBehavior({ open: active !== null, onClose });

  if (active === null) return null;

  const bodyProps: BodyProps = { tab: active, actions: controller.actions, onClose };
  const title = (
    <h2 className="text-base font-semibold tracking-wide" style={{ color: text }}>
      Settings
    </h2>
  );

  if (controller.variant === "fullscreen") {
    return (
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Settings" tabIndex={-1} className="pointer-events-auto absolute inset-0 z-40 flex flex-col" style={{ background: surface, color: text, fontFamily: fontDisplay }}>
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4">
          <div className="flex items-center justify-between gap-3 pb-4 pt-6">
            <h2 className="text-2xl font-bold tracking-wide" style={{ color: text }}>
              Settings
            </h2>
            <CloseButton onClose={onClose} />
          </div>
          <ScrollRail label="settings categories" style={{ paddingBottom: 16 }}>
            {tabs.map((tab) => (
              <TabButton key={tab.id} tab={tab} selected={tab.id === active.id} orientation="row" onSelect={() => setActiveId(tab.id)} />
            ))}
          </ScrollRail>
          <Body {...bodyProps} />
        </div>
      </div>
    );
  }

  if (controller.variant === "sidebar") {
    return (
      <Backdrop onClose={onClose} align="items-center">
        <div
          ref={dialogRef} role="dialog" aria-modal="true" aria-label="Settings" tabIndex={-1}
          onClick={stop}
          className="flex overflow-hidden rounded-2xl shadow-2xl"
          style={{ ...panelStyle, width: "min(94vw, 760px)", height: "min(84vh, 560px)" }}
        >
          <nav className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto p-3" style={{ background: surfaceDeep, borderRight: `1px solid ${edge}` }}>
            <span className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-widest" style={{ color: textDim }}>
              Settings
            </span>
            {tabs.map((tab) => (
              <TabButton key={tab.id} tab={tab} selected={tab.id === active.id} orientation="col" onSelect={() => setActiveId(tab.id)} />
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col">
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
          ref={dialogRef} role="dialog" aria-modal="true" aria-label="Settings" tabIndex={-1}
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
          <ScrollRail label="settings categories" style={{ padding: "0 16px 12px" }}>
            {tabs.map((tab) => (
              <TabButton key={tab.id} tab={tab} selected={tab.id === active.id} orientation="row" onSelect={() => setActiveId(tab.id)} />
            ))}
          </ScrollRail>
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
        ref={dialogRef} role="dialog" aria-modal="true" aria-label="Settings" tabIndex={-1}
        onClick={stop}
        className="flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ ...panelStyle, width: "min(92vw, 460px)", height: "min(86vh, 580px)" }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3.5" style={{ borderBottom: `1px solid ${edge}` }}>
          {title}
          <CloseButton onClose={onClose} />
        </div>
        <ScrollRail label="settings categories" style={{ padding: "12px 16px", borderBottom: `1px solid ${edge}` }}>
          {tabs.map((tab) => (
            <TabButton key={tab.id} tab={tab} selected={tab.id === active.id} orientation="row" onSelect={() => setActiveId(tab.id)} />
          ))}
        </ScrollRail>
        <Body {...bodyProps} />
      </div>
    </Backdrop>
  );
}
