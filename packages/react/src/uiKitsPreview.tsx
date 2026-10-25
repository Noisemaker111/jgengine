import type { CSSProperties, ReactNode } from "react";

import type { UiKit } from "./uiKit";
import { KitButton, KitMenu, KitMeter, KitMinimapFrame, KitPanel, KitPrompt, KitToast, UiKitRoot } from "./uiKitRoot";
import { UI_KITS, type UiKitName } from "./uiKits";

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
