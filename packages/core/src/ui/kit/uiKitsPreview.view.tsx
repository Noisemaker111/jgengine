import type { CSSProperties, ReactNode } from "react";

import { createSaveSlots, type SaveSlotMeta } from "@jgengine/core/save/saveSlots";

import { PauseMenu } from "@jgengine/core/menu/pauseMenu.view";
import { ContinuePane, CreditsPane, SaveSlotsPane } from "@jgengine/core/menu/gameMenuSaves.view";
import type { SettingsCategoryView } from "@jgengine/core/settings/settings.view";
import { SettingsSection, SettingsTabs } from "@jgengine/core/settings/settingsBlocks.view";
import type { UiKit } from "./uiKit.view";
import { KitButton, KitMenu, KitMeter, KitMinimapFrame, KitPanel, KitPrompt, KitToast, UiKitRoot } from "./uiKitRoot.view";
import { UI_KITS, type UiKitName } from "./uiKits.view";

const SCENE: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  background: [
    "radial-gradient(circle at 78% 22%, rgba(255,236,170,0.9) 0 7%, transparent 7.5%)",
    "linear-gradient(180deg, transparent 0 52%, #4f7d3a 52% 60%, #6a9a48 60% 74%, #8a6f4c 74%)",
    "repeating-linear-gradient(90deg, #5d6b7c 0 46px, #7d8a99 46px 58px, #3f4a57 58px 96px, transparent 96px 120px)",
    "linear-gradient(180deg, #7fb2d9 0%, #c9dbe6 40%, #e9c8a0 52%)",
  ].join(", "),
  backgroundSize: "100% 100%, 100% 100%, 100% 46%, 100% 100%",
  backgroundPosition: "0 0, 0 0, 0 56%, 0 0",
  backgroundRepeat: "no-repeat",
};

function FakeMap(): ReactNode {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="100" height="100" fill="#cfd8c4" />
      <path d="M0 62 Q30 55 52 66 T100 58 V100 H0Z" fill="#7db3d6" />
      <path d="M8 0 V100 M44 0 V58 M0 30 H100 M70 0 L84 100" stroke="#fff" strokeWidth="5" fill="none" />
      <path d="M8 0 V100 M44 0 V58 M0 30 H100 M70 0 L84 100" stroke="#9aa39a" strokeWidth="1" fill="none" />
      <circle cx="44" cy="30" r="5" fill="#ff4f6a" stroke="#fff" strokeWidth="2" />
      <path d="M50 46 l6 12 l-6 -3 l-6 3z" fill="#1d2430" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

const noop = () => undefined;
const noProps = () => ({});

/** Every kit part on a busy game-like backdrop, so one picture shows a kit's whole language. */
export function KitSpecimen({ kit, className, style }: { kit: UiKit; className?: string; style?: CSSProperties }): ReactNode {
  return (
    <UiKitRoot kit={kit} box className={className} style={{ ...SCENE, ...style }}>
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1fr auto", gridTemplateRows: "auto 1fr auto", gap: 22, padding: "30px 24px 22px" }}>
        <div style={{ display: "grid", gap: 16, alignContent: "start", maxWidth: 270 }}>
          <KitPanel eyebrow="Courier" title="Cargo hold" aside="2/3">
            <div style={{ display: "grid", gap: 10 }}>
              <KitMeter label="Health" value={72} max={100} readout tone="good" />
              <KitMeter label="Heat" value={6} max={10} variant="segments" segments={8} tone="warn" />
            </div>
          </KitPanel>
          <KitToast tone="good" title="Delivered" count={3}>+$120 tip from Elroy</KitToast>
        </div>
        <div style={{ display: "grid", gap: 26, justifyItems: "end", alignContent: "start" }}>
          <KitMinimapFrame size={128} shape="circle" label="Harbor Row" heading={0.6}>
            <FakeMap />
          </KitMinimapFrame>
          <KitMeter label="Tide" value={0.35} variant="ring" readout="0:42" tone="bad" />
        </div>
        <div style={{ gridColumn: "1 / span 2", display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "center" }}>
          <KitMenu
            variant="pause"
            activeId="resume"
            itemProps={noProps}
            onSelect={noop}
            items={[
              { id: "resume", label: "Resume", hint: "Back to the run" },
              { id: "new", label: "New run", badge: "New" },
              { id: "settings", label: "Settings" },
              { id: "quit", label: "Quit to title", secondary: true },
            ]}
          />
          <KitToast tone="bad" title="Missed!">The tide went out</KitToast>
        </div>
        <div style={{ gridColumn: "1 / span 2", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <KitPrompt device="keyboard" glyph="E" label="Take parcel" progress={0.4} />
          <KitPrompt device="gamepad" glyph="A" label="Talk" tone="good" />
          <KitButton variant="primary" glyph="Enter">Start</KitButton>
          <KitButton>Settings</KitButton>
          <KitButton variant="ghost" size="sm">Back</KitButton>
        </div>
      </div>
    </UiKitRoot>
  );
}

function KitCell({ name }: { name: UiKitName }): ReactNode {
  const kit = UI_KITS[name];
  return (
    <figure style={{ margin: 0, display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0, minWidth: 0 }}>
      <figcaption style={{ padding: "6px 10px", font: "700 15px/1.2 system-ui, sans-serif", color: "#f5f7fa", background: "#0b0d12" }}>
        {kit.name} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {name} · {kit.description}</span>
      </figcaption>
      <KitSpecimen kit={kit} style={{ minHeight: 0 }} />
    </figure>
  );
}

/** Contact sheet: all eight built-in UI kits side by side, every part each. */
export function UiKitsPreview({ className }: { className?: string }): ReactNode {
  const names = Object.keys(UI_KITS) as UiKitName[];
  return (
    <div className={className} style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: 6, width: "100vw", height: "100vh", background: "#0b0d12" }}>
      {names.map((name) => (
        <KitCell key={name} name={name} />
      ))}
    </div>
  );
}

function KitDialogs({ kit }: { kit: UiKit }): ReactNode {
  return (
    <UiKitRoot kit={kit} box style={{ ...SCENE, display: "grid", placeItems: "center", gap: 24, padding: 32 }}>
      <KitPanel variant="strip" title="Wanted" aside="★★★" />
      <KitPanel
        variant="dialog"
        tone="bad"
        eyebrow="Run over"
        title="Missed the tide"
        footer={
          <>
            <KitButton variant="primary" glyph="E">Try again</KitButton>
            <KitButton variant="ghost">Title</KitButton>
          </>
        }
        style={{ maxWidth: 460 }}
      >
        Parcel lost at Shore Steps. Tips kept: $64.
      </KitPanel>
    </UiKitRoot>
  );
}

/** One kit, large: the specimen plus its dialog and strip, for working on a single kit. */
export function UiKitPreview({ kit, className }: { kit: UiKit; className?: string }): ReactNode {
  return (
    <div className={className} style={{ display: "grid", gridTemplateColumns: "3fr 2fr", width: "100vw", height: "100vh", background: "#0b0d12", gap: 6 }}>
      <KitSpecimen kit={kit} />
      <KitDialogs kit={kit} />
    </div>
  );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const SOUND: SettingsCategoryView = {
  id: "audio",
  label: "Sound",
  rows: [
    { id: "master", label: "Master volume", kind: "slider", value: 0.8, min: 0, max: 1, step: 0.05, format: percent, set: noop },
    { id: "music", label: "Music", kind: "slider", value: 0.45, min: 0, max: 1, step: 0.05, format: percent, set: noop },
    { id: "mute", label: "Mute all", kind: "toggle", value: false, set: noop },
    { id: "captions", label: "Captions", kind: "toggle", value: true, set: noop },
  ],
  keybinds: [
    { action: "interact", label: "Interact", bindingLabel: "E", isDefault: true, rebind: noop, reset: noop },
    { action: "pause", label: "Pause", bindingLabel: "P", isDefault: false, rebind: noop, reset: noop },
  ],
};
const TABS: SettingsCategoryView[] = [SOUND, { ...SOUND, id: "graphics", label: "Graphics" }, { ...SOUND, id: "controls", label: "Controls" }];

/** Fixed save times, so preview pictures do not change between runs. */
const SAVED_AT = Date.UTC(2026, 9, 24, 21, 30);
const SAVES: SaveSlotMeta[] = [
  { id: "slot-1", name: "Mara Vell", empty: false, savedAt: SAVED_AT, meta: { playtime: 5_400, chapter: "Shore Steps", cash: "$1,240" } },
  { id: "slot-2", name: "Dockside run", empty: false, savedAt: SAVED_AT - 86_400_000, meta: { playtime: 1_800, chapter: "Old Pier" } },
  { id: "slot-3", empty: true, meta: {} },
];
const saveSlots = createSaveSlots({ slots: SAVES, now: () => SAVED_AT });

/** The engine panes a kit's menu can host, for {@link UiKitMenuPreview}. */
export type UiKitMenuPreviewPane = "settings" | "credits" | "continue" | "saves";

/**
 * A kit's pause menu with one of the engine's own panes in it (settings, credits, continue or saves),
 * so one picture shows that engine panes read in the kit's colours and type.
 */
export function UiKitMenuPreview({ kit, pane = "settings", className }: { kit: UiKit; pane?: UiKitMenuPreviewPane; className?: string }): ReactNode {
  return (
    <UiKitRoot kit={kit} box className={className} style={{ ...SCENE, width: "100vw", height: "100vh" }}>
      <PauseMenu
        items={[
          { id: "resume", label: "Resume" },
          { id: "settings", label: "Settings" },
          { id: "continue", label: "Continue" },
          { id: "saves", label: "Saves" },
          { id: "credits", label: "Credits" },
        ]}
        initialId={pane}
        onSelect={noop}
        logo={{ text: kit.name, title: kit.name }}
        tagline="Paused. The world waits."
        detail={(id) =>
          id === "continue" ? (
            <ContinuePane slot={saveSlots.mostRecent()} onContinue={noop} now={() => SAVED_AT + 60_000} />
          ) : id === "saves" ? (
            <SaveSlotsPane model={saveSlots} heading="Saves" onLoad={noop} onNew={noop} onContinue={noop} now={() => SAVED_AT + 60_000} />
          ) : id === "credits" ? (
            <CreditsPane sections={[{ heading: "Made by", entries: [{ label: "Design", detail: "Jon" }, { label: "Engine", detail: "JGengine" }] }]} notice="Fonts and sounds under their own licences." />
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <SettingsTabs categories={TABS} activeId="audio" onSelect={noop} />
              <SettingsSection category={SOUND} enabled={false} />
            </div>
          )
        }
      />
    </UiKitRoot>
  );
}