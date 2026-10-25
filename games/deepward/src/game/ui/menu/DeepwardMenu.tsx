import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ContinuePane, CreditsPane, SaveSlotsPane } from "@jgengine/react/gameMenuSaves";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useGameStore, useOptionalGamePhase } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import { useStore } from "@jgengine/react/store";
import type { SaveSlotMeta } from "@jgengine/core/game/saveSlots";
import { GameFrame } from "@jgengine/react/gameFrame";

import { DEEPWARD_CREDITS } from "../../credits";
import { loadRecordSlot, beginRecordSlot, openTitle, persistRecord, recordOf, withdrawToTitle, viewStore } from "../../controls";
import { captureRecordThumb, recordLabel, recordSlots, refreshRecordSlots } from "../../menuRecord";
import { depthAt } from "../../../world";
import { CACHE_WEIGHT, loadOf } from "../../haul";

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

/** Marrow's console palette for the menu chrome the kit does not draw (header, footer, tint). */
const MENU_TOKENS = {
  "--jg-accent": "#e2bd6e",
  "--jg-accent-soft": "rgba(226,189,110,0.24)",
  "--jg-accent-glow": "rgba(226,189,110,0.3)",
  "--jg-text": "#ede9d9",
  "--jg-text-dim": "rgba(214,226,220,0.86)",
  "--jg-menu-logo-size": "clamp(30px, 4.4vw, 64px)",
} as const;

/** A stencilled hull nameplate: the console's own name, riveted on. */
function Nameplate({ word, sub, small = false }: { word: string; sub: ReactNode; small?: boolean }): ReactNode {
  return (
    <GameFrame material="hull" cut="notch" depth={small ? 12 : 16} tint="#26404b" edge="#060d10" edgeWidth={2} padding={small ? "10px 22px 11px" : "14px 30px 16px"} className={`dw-nameplate${small ? " dw-nameplate-small" : ""}`}>
      <span className="dw-nameplate-word">{word}</span>
      <span className="dw-nameplate-sub">{sub}</span>
    </GameFrame>
  );
}

/** The dive log's heading line. */
function LogHead({ children, tag }: { children: ReactNode; tag?: ReactNode }): ReactNode {
  return (
    <div className="dw-log-head">
      <span className="dw-log-caret" aria-hidden="true">&gt;</span>
      <span className="dw-log-title">{children}</span>
      {tag === undefined ? null : <span className="dw-log-tag">{tag}</span>}
    </div>
  );
}

/** Console key legend: stamped key caps, not a sentence. */
function KeyLegend({ pause }: { pause: boolean }): ReactNode {
  return (
    <span className="dw-keylegend">
      <kbd>&uarr;&darr;</kbd><span>select</span><kbd>Enter</kbd><span>confirm</span><kbd>Esc</kbd><span>{pause ? "resume" : "back"}</span>
    </span>
  );
}

type Screen = "title" | "pause";

/** The record a new dive would replace, so a full profile says which Life it is asking about. */
function replaceable(): string | null {
  const held = recordSlots.list().sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
  return held[0]?.id ?? null;
}

/** The words a dive is described in: whose Life it is, what it carries. */
function DiveLine() {
  const view = useStore(viewStore);
  const dive = view.dive;
  if (dive === null) return <span>Marrow &middot; Life {view.home.life} &middot; {view.home.stash.length} banked</span>;
  return <span>Bellwether &middot; Life {view.home.life} &middot; carry {dive.cache.length}</span>;
}

/** The New dive pane: a fresh Life starts at the home, ready to walk to the garage. */
function NewDivePane({ slot, onBegin }: { slot: string | null; onBegin: () => void }): ReactNode {
  const view = useStore(viewStore);
  const occupancy = recordSlots.get(slot ?? "");
  const replacing = occupancy !== null && !occupancy.empty;
  const air = view.home.refits.includes("tank") ? 145 : 110;
  return (
    <div data-new-dive-pane="" className="dw-log">
      <LogHead tag={slot === null ? "no record free" : recordLabel(slot)}>New dive</LogHead>
      <p className="dw-log-line">Full tank. Issue sidearm. Rail to Bellwether and back before the air runs out.</p>
      <dl className="dw-log-stats">
        <div><dt>Air</dt><dd>{air}<small>s</small></dd></div>
        <div><dt>Cache</dt><dd>4&times;3</dd></div>
        <div><dt>Load</dt><dd>12<small>kg</small></dd></div>
        <div><dt>Life</dt><dd>{view.home.life}</dd></div>
      </dl>
      {replacing && slot !== null ? <p className="dw-log-warn">{recordLabel(slot)} is held. A new dive replaces it.</p> : null}
      <GameFrame
        as="button"
        data-new-dive-start=""
        material="brass"
        cut="hex"
        depth={14}
        padding="12px 34px"
        disabled={slot === null}
        onClick={onBegin}
        className="dw-log-go"
      >
        Take the rail
      </GameFrame>
    </div>
  );
}

/** The frozen dive computer: what the pause is holding, in four numbers. */
function HeldBoard({ hint }: { hint?: string }): ReactNode {
  const view = useStore(viewStore);
  const dive = view.dive;
  const at = useGameStore((state) => state.scene.entity.get(state.player.userId)?.position ?? ([0, 0, 0] as const));
  const rows: [string, ReactNode][] = dive === null
    ? [["Scrip", view.home.bank.banked], ["Stash", view.home.stash.length], ["Returns", view.home.extractions], ["Life", view.home.life]]
    : [
        ["Air", <>{Math.ceil(dive.oxygen)}<small>s</small></>],
        ["Depth", String(depthAt(at, "vault")).padStart(2, "0")],
        ["Carry", <>{loadOf(dive.cache).mass}<small>/{CACHE_WEIGHT}</small></>],
        ["Suit", <>{Math.ceil(dive.health)}<small>%</small></>],
      ];
  return (
    <div className="dw-log" data-held-board="">
      <LogHead tag={dive === null ? "Marrow" : "Bellwether"}>{dive === null ? "Home held" : "Dive held"}</LogHead>
      <dl className="dw-log-stats dw-log-stats-big">
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <p className="dw-log-line">{hint ?? "Tank and prints are stopped while this console is open."}</p>
    </div>
  );
}

/**
 * Deepward's front end: the record list lives over the station, with its own words for a dive, a
 * haul, the return and the home. Continue re-reads the saved record it names.
 */
export function DeepwardMenu(): ReactNode {
  const ctx = useGameContext();
  const phase = useOptionalGamePhase();
  const settings = useSettings();
  const view = useStore(viewStore);
  const slots = useSaveSlots(recordSlots);
  const [screen, setScreen] = useState<Screen>(phase === "paused" ? "pause" : "title");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = recordSlots.mostRecent();
  const emptySlot = slots.find((slot) => slot.empty)?.id ?? replaceable();
  const open = recordOf(ctx)?.slot() ?? "marrow";

  useEffect(() => {
    setScreen(phase === "paused" ? "pause" : "title");
    setNotice(null);
    if (phase === "menu") void refreshRecordSlots(ctx);
  }, [phase, ctx]);

  const back = useCallback(() => {
    if (phase === "paused") {
      ctx.game.commands.run(view.mode === "home" || view.mode === "dive" ? "deepward.close" : "deepward.pause", {});
      return;
    }
    openTitle(ctx);
  }, [ctx, phase, view.mode]);

  if (phase !== "menu" && phase !== "paused") return null;

  /** Every record read and write is real work; the label holds the surface while it happens. */
  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 280))]);
    } finally {
      setBusy(null);
    }
  };

  const openRecord = (slot: string) =>
    whileLoading("Reading the record", async () => {
      await loadRecordSlot(ctx, slot);
      await refreshRecordSlots(ctx);
    });

  const startNew = (slot: string | null) => {
    if (slot === null) return;
    void whileLoading("Printing the record", async () => {
      await beginRecordSlot(ctx, slot, recordSlots.get(slot)?.empty === false);
      await refreshRecordSlots(ctx);
    });
  };

  const saveHere = () =>
    whileLoading("Writing the record", async () => {
      await captureRecordThumb();
      await persistRecord(ctx);
      await refreshRecordSlots(ctx);
      setNotice(`Written to ${recordLabel(open)}`);
    });

  const titleMenu = (
    <GameMenu
      open={screen === "title"}
      label="Deepward"
      className="dw-console"
      initialId={menuFocus.id ?? (recent === null ? "new" : "continue")}
      logo={{ text: <Nameplate word="DEEPWARD" sub={<>Halloway print service &middot; line 06</>} />, title: "Deepward" }}
      items={[
        {
          id: "continue",
          label: "Continue dive",
          hint: recent === null ? "No record on this profile" : (recent.name ?? recordLabel(recent.id)),
          disabled: recent === null,
        },
        {
          id: "new",
          label: "New dive",
          hint: emptySlot === null ? "No record available" : `Writes ${recordLabel(emptySlot)}`,
          disabled: emptySlot === null,
        },
        { id: "records", label: "Dives & hauls", hint: `${slots.filter((slot) => !slot.empty).length} of ${slots.length} records held` },
        { id: "settings", label: "Settings", hint: "Sound, picture, controls" },
        { id: "credits", label: "Credits" },
      ]}
      detail={(id) => {
        if (id === "continue") {
          return (
            <div className="dw-log">
              <LogHead tag={recent === null ? "empty" : recordLabel(recent.id)}>Continue dive</LogHead>
              <ContinuePane
                slot={recent}
                emptyMessage="No dive kept yet. Take the rail, pack a haul and save it from the pause console."
                onContinue={(slot) => void openRecord(slot.id)}
              />
            </div>
          );
        }
        if (id === "new") return <NewDivePane slot={emptySlot} onBegin={() => startNew(emptySlot)} />;
        if (id === "records") {
          return (
            <SaveSlotsPane
              model={recordSlots}
              heading="Dives & hauls"
              columns="auto"
              onContinue={(slot: SaveSlotMeta) => void openRecord(slot.id)}
              onLoad={(slot: SaveSlotMeta) => void openRecord(slot.id)}
              onNew={(slot: SaveSlotMeta) => startNew(slot.id)}
              onDelete={(slot: SaveSlotMeta) => {
                void whileLoading("Burning the record", async () => {
                  recordSlots.clear(slot.id);
                  await recordOf(ctx)?.deleteSlot(slot.id);
                  await refreshRecordSlots(ctx);
                });
              }}
            />
          );
        }
        if (id === "settings") return <RecordSettings />;
        if (id === "credits") return <CreditsPane sections={DEEPWARD_CREDITS.sections} notice={DEEPWARD_CREDITS.notice} heading="Deepward" />;
        return null;
      }}
      onHighlight={(id) => {
        if (id === "records") void refreshRecordSlots(ctx);
      }}
      onSelect={(id) => {
        if (id === "continue" && recent !== null) void openRecord(recent.id);
        else if (id === "records") void refreshRecordSlots(ctx);
      }}
      footer={<span className="dw-console-foot">Marrow / {recordLabel(open)} &middot; Life {view.home.life} &middot; {view.home.bank.banked} scrip{notice === null ? "" : ` · ${notice}`}</span>}
      controlHint={<KeyLegend pause={false} />}
      style={MENU_TOKENS}
    />
  );

  const pauseMenu = (
    <GamePauseMenu
      open={screen === "pause"}
      label={view.dive === null ? "The home is held" : "The dive is held"}
      className="dw-console"
      onBack={back}
      onResume={back}
      logo={{ text: <Nameplate small word={view.dive === null ? "HOME HELD" : "DIVE HELD"} sub={<DiveLine />} />, title: "Hold" }}
      items={[
        { id: "resume", label: view.dive === null ? "Back to Marrow" : "Back to the dive" },
        { id: "save", label: `Save to ${recordLabel(open)}`, hint: "Life and haul, as they stand" },
        { id: "settings", label: "Settings" },
        { id: "credits", label: "Credits" },
      ]}
      secondary={[{ id: "title", label: "Save & leave to title" }]}
      detail={(id) =>
        id === "settings" ? (
          <RecordSettings />
        ) : id === "credits" ? (
          <CreditsPane sections={DEEPWARD_CREDITS.sections} notice={DEEPWARD_CREDITS.notice} heading="Deepward" />
        ) : (
          <HeldBoard hint={id === "save" ? `Writes this Life to ${recordLabel(open)}.` : id === "title" ? "Writes the record, then shuts the console down to the title." : undefined} />
        )
      }
      onSelect={(id) => {
        if (id === "resume") back();
        else if (id === "save") void saveHere();
        else if (id === "title") void whileLoading("Writing the record", () => withdrawToTitle(ctx));
      }}
      footer={<span className="dw-console-foot">{notice ?? `${view.home.bank.banked} scrip banked · Life ${view.home.life}`}</span>}
      controlHint={<KeyLegend pause />}
      style={MENU_TOKENS}
    />
  );

  return (
    <div className="dw-menu">
      {titleMenu}
      {pauseMenu}
      {busy !== null && (
        <div className="dw-console-busy" role="status" aria-live="polite">
          <span>{busy}</span>
        </div>
      )}
    </div>
  );
}

/** The shell's settings, drawn inside the record pane. */
function RecordSettings(): ReactNode {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const categories = settings.categories;
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId) ?? null;
  return (
    <div data-deepward-settings="" className="dw-log dw-log-fill">
      <LogHead tag="console">Settings</LogHead>
      <SettingsTabs categories={categories} activeId={activeId} onSelect={setChosen} />
      <div style={{ overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
        {active === null ? null : <SettingsSection category={active} heading={false} />}
      </div>
    </div>
  );
}
