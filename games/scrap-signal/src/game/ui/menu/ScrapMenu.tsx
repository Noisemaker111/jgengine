import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCanvasCover } from "@jgengine/react";
import { CreditsPanel } from "@jgengine/react/creditsPanel";
import { useGame } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";

import { gamePhase } from "@jgengine/core/game/gamePhase";

import { SCRAP_CREDITS } from "../../credits";
import { scrapProfile } from "../../scrapProfile";
import { SCRAP_SLOTS, refreshScrapSlots, scrapSlots } from "../../scrapSlots";
import { BroadcastTitle, type KeptSignal } from "../fiction/BroadcastTitle";

function savedAgo(savedAt: number | undefined): string {
  if (savedAt === undefined) return "";
  const minutes = Math.floor((Date.now() - savedAt) / 60_000);
  if (minutes < 1) return "Saved just now";
  if (minutes < 60) return `Saved ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Saved ${hours}h ago` : `Saved ${Math.floor(hours / 24)}d ago`;
}

/**
 * Scrap Signal's front end, and the only surface a boot shows: the jammed broadcast. A kept run is a
 * signal to resume; tuning a reclaimer channel starts a new run in a free bay (or the oldest one).
 */
export function ScrapMenu(): ReactNode {
  const ctx = useGameContext();
  const { commands } = useGame();
  const phase = useSyncExternalStore(ctx.subscribe, () => gamePhase(ctx), () => gamePhase(ctx));
  const slots = useSaveSlots(scrapSlots);
  const [callSign, setCallSign] = useState("");
  const [credits, setCredits] = useState(false);

  // Refresh the kept-run index when the menu appears, not on every render: the refresh writes the
  // index, the index notifies the pane, and an effect keyed on the context identity would loop.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  useEffect(() => {
    void refreshScrapSlots(ctxRef.current);
  }, [phase]);

  // The broadcast fills the screen: the field behind it is not drawn while the front end is up.
  useCanvasCover(phase === "menu");
  if (phase !== "menu") return null;

  const kept = slots.filter((slot) => !slot.empty).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  const recent = kept[0] ?? null;
  const bay = slots.find((slot) => slot.empty)?.id ?? kept[kept.length - 1]?.id ?? SCRAP_SLOTS[0].id;
  const signal: KeptSignal | null = recent === null
    ? null
    : {
        name: recent.name ?? "Reclaimer",
        detail: [
          SCRAP_SLOTS.find((slot) => slot.id === recent.id)?.label,
          recent.meta.playtime === undefined ? undefined : `${String(recent.meta.playtime)} played`,
          savedAgo(recent.savedAt),
        ].filter((part) => part !== undefined && part !== "").join(" · "),
      };

  if (credits) {
    return <CreditsPanel open document={SCRAP_CREDITS} title="Scrap Signal credits" onBack={() => setCredits(false)} />;
  }

  return (
    <BroadcastTitle
      onCredits={() => setCredits(true)}
      kept={signal}
      onContinue={() => { if (recent !== null) commands.run("run.continue", { slot: recent.id }); }}
      callSign={callSign}
      onCallSign={setCallSign}
      onPick={(characterId) => {
        const name = callSign.trim();
        scrapProfile.name = name === "" ? null : name;
        commands.run("character.pick", { characterId, slot: bay });
      }}
    />
  );
}
