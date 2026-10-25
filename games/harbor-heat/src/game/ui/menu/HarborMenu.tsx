import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from "react";
import { createSaveSlots } from "@jgengine/core/game/saveSlots";
import { formatSavePlaytime, gameSaveSlotSource, refreshSaveSlots } from "@jgengine/core/game/saveSlotIndex";
import { useGame } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useStore } from "@jgengine/react/store";

import { startedStore } from "../../commands";
import { captureHarborThumb, harborProfile } from "../../menuProfile";
import { harborSave, loadHarborSave, saveHarborState } from "../../save";
import { sessionStore } from "../../session";
import { BayTags, ContinueTag, CourierLicence, HarborTitle, TitlePhone, TribuneCredits, type TitleItem } from "./HarborTitle";
import { harborFocus } from "./menuFocus";
import { PausePhone } from "./PausePhone";

/** Harbor's dispatch bays; a parcel run is kept in one of them. */
export const HARBOR_BAYS = [
  { id: "coast", label: "The Coast" },
  { id: "docks", label: "The Docks" },
  { id: "uptown", label: "Uptown" },
] as const;

const BAY_LABELS: Record<string, string> = Object.fromEntries(HARBOR_BAYS.map((bay) => [bay.id, bay.label]));

const DEFAULT_DRIVER = "Mara Vell";
/** The HUD root is pointer-events-none so the canvas owns the mouse; the menu must take it back. */
const MENU_ROOT: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, pointerEvents: "auto" };

const harborSlots = createSaveSlots({
  capacity: HARBOR_BAYS.length,
  slots: HARBOR_BAYS.map((bay) => ({ id: bay.id, empty: true, meta: {} })),
});

/** Keep the slot index in step with the dispatch documents. */
export async function refreshHarborSlots(ctx: ReturnType<typeof useGameContext>): Promise<void> {
  await refreshSaveSlots(gameSaveSlotSource(harborSave(ctx)), harborSlots, {
    nameOf: (_slot, document) => {
      const profile = (document.systems.profile ?? {}) as { driver?: string | null };
      return typeof profile.driver === "string" && profile.driver.length > 0 ? profile.driver : "Courier";
    },
    metaOf: (_slot, document) => {
      const run = (document.systems.run ?? {}) as { courierSession?: { closed?: number; session?: number } };
      const profile = (document.systems.profile ?? {}) as { driver?: string | null; thumbnail?: string | null };
      return {
        ...(typeof profile.driver === "string" && profile.driver.length > 0 ? { character: profile.driver } : {}),
        parcels: Math.max(0, run.courierSession?.closed ?? 0),
        runs: Math.max(0, run.courierSession?.session ?? 0),
        playtime: formatSavePlaytime(document.playtime),
        ...(typeof profile.thumbnail === "string" && profile.thumbnail.length > 0 ? { thumbnail: profile.thumbnail } : {}),
      };
    },
  });
}

/** Started flag the shell reveals play chrome with. */
export function useGameStarted(): boolean {
  return useStore(startedStore, (value) => value === true);
}

/** Harbor Heat's front end: the roadside sign at dusk, and the burner phone when you step off the clock. */
export function HarborMenu(): ReactNode {
  const ctx = useGameContext();
  const { commands } = useGame();
  const session = useStore(sessionStore, (value) => value);
  const started = useGameStarted();
  const bays = useSaveSlots(harborSlots);
  const [name, setName] = useState(harborProfile.driver ?? DEFAULT_DRIVER);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = harborSlots.mostRecent();
  const paused = session.paused === true;

  useEffect(() => {
    void refreshHarborSlots(ctx);
  }, [ctx, started]);

  const saveHere = useCallback(async () => {
    setBusy(true);
    setNotice("Saving...");
    try {
      harborProfile.driver = name.trim() === "" ? harborProfile.driver : name.trim();
      await captureHarborThumb();
      await saveHarborState(ctx);
      await refreshHarborSlots(ctx);
      setNotice(`Saved to ${BAY_LABELS[harborSave(ctx).slot()] ?? "the bay"}.`);
    } finally {
      setBusy(false);
    }
  }, [ctx, name]);

  const openBay = async (slot: string) => {
    setBusy(true);
    try {
      if (harborSave(ctx).slot() !== slot) await harborSave(ctx).switchSlot(slot, { flush: false });
      const loaded = await loadHarborSave(ctx);
      if (!loaded) setNotice("That bay is empty.");
      commands.run("game.start", {});
    } finally {
      setBusy(false);
    }
  };

  const beginIn = async (slot: string) => {
    setBusy(true);
    try {
      if (harborSave(ctx).slot() !== slot) await harborSave(ctx).switchSlot(slot, { flush: false });
      harborProfile.driver = name.trim() === "" ? DEFAULT_DRIVER : name.trim();
      await saveHarborState(ctx);
      await refreshHarborSlots(ctx);
      commands.run("game.start", {});
    } finally {
      setBusy(false);
    }
  };

  // A fresh pause always opens on its home screen, with no stale save line.
  useEffect(() => {
    if (paused) setNotice(null);
  }, [paused]);

  if (!started) {
    const kept = bays.filter((bay) => !bay.empty).length;
    const items: TitleItem[] = [
      { id: "continue", label: "Continue", hint: recent === null ? "No run on the board" : `${recent.name ?? recent.id}`, disabled: recent === null },
      { id: "new", label: "Hit the street", hint: "New courier" },
      { id: "keeps", label: "Missions & parcels", hint: `${kept} of ${bays.length} bays` },
      { id: "settings", label: "Settings", hint: "Sound · picture · keys" },
      { id: "credits", label: "Credits" },
    ];
    return (
      <div className="hh-menu-root" style={MENU_ROOT}>
        <HarborTitle
          items={items}
          initialId={harborFocus.id ?? (recent === null ? "new" : "continue")}
          notice={`${busy ? "Saving... " : ""}${notice ?? ""}`}
          detail={(id, active, back) => {
            if (id === "continue") return <ContinueTag slot={recent} bayLabel={recent === null ? "" : (BAY_LABELS[recent.id] ?? recent.id)} active={active} onContinue={() => { if (recent !== null) void openBay(recent.id); }} />;
            if (id === "new") return <CourierLicence name={name} onName={setName} bayLabel={BAY_LABELS[bayForNew()] ?? ""} active={active} onBegin={() => void beginIn(bayForNew())} />;
            if (id === "keeps") {
              return (
                <BayTags
                  bays={bays}
                  labels={BAY_LABELS}
                  active={active}
                  onLoad={(slot) => void openBay(slot.id)}
                  onNew={(slot) => void beginIn(slot.id)}
                  onClear={(slot) => {
                    harborSlots.clear(slot.id);
                    void harborSave(ctx).deleteSlot(slot.id).then(() => refreshHarborSlots(ctx));
                  }}
                />
              );
            }
            if (id === "settings") return <TitlePhone active={active} onBack={back} />;
            return <TribuneCredits />;
          }}
        />
      </div>
    );
  }

  if (!paused) return null;

  return (
    <div className="hh-menu-root" style={MENU_ROOT}>
      <PausePhone
        onResume={() => commands.run("session.pause", { paused: false })}
        onSave={() => void saveHere()}
        notice={notice ?? ""}
        bayLabel={BAY_LABELS[harborSave(ctx).slot()] ?? ""}
        kept={`${bays.filter((bay) => !bay.empty).length} of ${bays.length} bays kept`}
      />
    </div>
  );
}

function bayForNew(): string {
  const empty = harborSlots.list().find((slot) => slot.empty);
  if (empty !== undefined) return empty.id;
  const held = harborSlots.list().sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
  return held[0]?.id ?? HARBOR_BAYS[0].id;
}
