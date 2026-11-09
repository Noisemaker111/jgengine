import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ContinuePane, CreditsPane, SaveSlotsPane } from "@jgengine/core/menu/gameMenuSaves.view";
import { KitButton, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { GameMenu } from "@jgengine/core/menu/gameMenu.view";
import { PauseMenu } from "@jgengine/core/menu/pauseMenu.view";
import { useGameStore, useOptionalGamePhase } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/core/save/saveSlots.view";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { SettingsSection, SettingsTabs } from "@jgengine/core/settings/settingsBlocks.view";
import { useStore } from "@jgengine/react/store";
import type { SaveSlotMeta } from "@jgengine/core/save/saveSlots";

import { DEEPWARD_CREDITS } from "../../credits";
import { loadRecordSlot, beginRecordSlot, openMarrowTitle, persistRecord, recordOf, withdrawToTitle, viewStore } from "../../controls";
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
    <KitPanel material="hull" cut="notch" depth={small ? 12 : 16} tint="#26404b" edge="#060d10" edgeWidth={2} padding={small ? "10px 22px 11px" : "14px 30px 16px"} className={`dw-nameplate${small ? " dw-nameplate-small" : ""}`}>
      <span className="dw-nameplate-word">{word}</span>
      <span className="dw-nameplate-sub">{sub}</span>
    </KitPanel>
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
  const line = useStore(viewStore, (v) => ({ life: v.home.life, banked: v.home.stash.length, carry: v.dive?.cache.length ?? null }));
  if (line.carry === null) return <span>Marrow &middot; Life {line.life} &middot; {line.banked} banked</span>;
  return <span>Bellwether &middot; Life {line.life} &middot; carry {line.carry}</span>;
}

/** The New dive pane: a fresh Life starts at the home, ready to walk to the garage. */
function NewDivePane({ slot, onBegin }: { slot: string | null; onBegin: () => void }): ReactNode {
  const { life, air } = useStore(viewStore, (v) => ({ life: v.home.life, air: v.home.refits.includes("tank") ? 145 : 110 }));
  const occupancy = recordSlots.get(slot ?? "");
  const replacing = occupancy !== null && !occupancy.empty;
  return (
    <div data-new-dive-pane="" className="dw-log">
      <LogHead tag={slot === null ? "no record free" : recordLabel(slot)}>New dive</LogHead>
      <p className="dw-log-line">Full tank. Issue sidearm. Rail to Bellwether and back before the air runs out.</p>
      <dl className="dw-log-stats">
        <div><dt>Air</dt><dd>{air}<small>s</small></dd></div>
        <div><dt>Cache</dt><dd>4&times;3</dd></div>
        <div><dt>Load</dt><dd>12<small>kg</small></dd></div>
        <div><dt>Life</dt><dd>{life}</dd></div>
      </dl>
      {replacing && slot !== null ? <p className="dw-log-warn">{recordLabel(slot)} is held. A new dive replaces it.</p> : null}
      <KitButton
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
      </KitButton>
    </div>
  );
}

/** The frozen dive computer: what the pause is holding, in four numbers. */
function HeldBoard({ hint }: { hint?: string | undefined }): ReactNode {
  const board = useGameStore((state) => {
    const view = viewStore.read(state), dive = view.dive;
    if (dive === null) return { diving: false, scrip: view.home.bank.banked, stash: view.home.stash.length, returns: view.home.extractions, life: view.home.life, air: 0, depth: 0, carry: 0, suit: 0 };
    const at = state.scene.entity.get(state.player.userId)?.position ?? ([0, 0, 0] as const);
    return { diving: true, scrip: 0, stash: 0, returns: 0, life: 0, air: Math.ceil(dive.oxygen), depth: depthAt(at, "vault"), carry: loadOf(dive.cache).mass, suit: Math.ceil(dive.health) };
  });
  const rows: [string, ReactNode][] = !board.diving
    ? [["Scrip", board.scrip], ["Stash", board.stash], ["Returns", board.returns], ["Life", board.life]]
    : [
        ["Air", <>{board.air}<small>s</small></>],
        ["Depth", String(board.depth).padStart(2, "0")],
        ["Carry", <>{board.carry}<small>/{CACHE_WEIGHT}</small></>],
        ["Suit", <>{board.suit}<small>%</small></>],
      ];
  return (
    <div className="dw-log" data-held-board="">
      <LogHead tag={board.diving ? "Bellwether" : "Marrow"}>{board.diving ? "Dive held" : "Home held"}</LogHead>
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
  const view = useStore(viewStore, (v) => ({ mode: v.mode, diving: v.dive !== null, life: v.home.life, banked: v.home.bank.banked }));
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
    openMarrowTitle(ctx);
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
      footer={<span className="dw-console-foot">Marrow / {recordLabel(open)} &middot; Life {view.life} &middot; {view.banked} scrip{notice === null ? "" : ` · ${notice}`}</span>}
      controlHint={<KeyLegend pause={false} />}
      style={MENU_TOKENS}
    />
  );

  const pauseMenu = (
    <PauseMenu
      open={screen === "pause"}
      label={!view.diving ? "The home is held" : "The dive is held"}
      className="dw-console"
      onBack={back}
      onResume={back}
      logo={{ text: <Nameplate small word={!view.diving ? "HOME HELD" : "DIVE HELD"} sub={<DiveLine />} />, title: "Hold" }}
      items={[
        { id: "resume", label: !view.diving ? "Back to Marrow" : "Back to the dive" },
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
      footer={<span className="dw-console-foot">{notice ?? `${view.banked} scrip banked · Life ${view.life}`}</span>}
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
