import { useGame, useInventory, usePlayer } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";

import { itemDefById } from "../../items/catalog";
import { delveStore, mailOpenStore, mailViewStore, valeCupStore, yumiStore } from "../../session/stores";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE, QUALITY_COLORS } from "../theme";

export function MailPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const open = useKeyedStore(mailOpenStore, userId);
  const view = useKeyedStore(mailViewStore, userId);
  const bags = useInventory("bags");
  if (!open) return null;
  return (
    <div className={`${PANEL} pointer-events-auto w-[520px] max-h-[70vh] overflow-hidden`}>
      <div className={PANEL_TITLE}>
        <span>Waystation Post</span>
        <button type="button" className={CLOSE_BUTTON} onClick={() => commands.run("mail.close", {})}>
          ✕
        </button>
      </div>
      <div className="space-y-3 overflow-y-auto px-4 py-3 text-sm">
        <p className="text-xs text-stone-400">Send items to yourself — they arrive after a short delay.</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-amber-800/70 bg-amber-950/50 px-2 py-1 text-xs text-amber-100 hover:bg-amber-900/50"
            onClick={() => commands.run("market.open", {})}
          >
            Open Market Board
          </button>
          <button
            type="button"
            className="rounded border border-stone-700 bg-stone-900/70 px-2 py-1 text-xs text-stone-300 hover:bg-stone-800"
            onClick={() => commands.run("mail.cod", {})}
          >
            COD (stub)
          </button>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">Send from bags</h3>
          <div className="max-h-40 space-y-0.5 overflow-y-auto">
            {bags.every((slot) => slot === null) ? (
              <p className="py-2 text-center text-xs text-stone-500">Empty bags</p>
            ) : (
              bags.map((slot, index) => {
                if (slot === null) return null;
                const item = itemDefById(slot.itemId);
                if (item === null) return null;
                return (
                  <button
                    key={`${slot.itemId}-${index}`}
                    type="button"
                    className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left hover:bg-stone-800/70"
                    onClick={() => commands.run("mail.sendSelf", { itemId: slot.itemId, count: 1 })}
                  >
                    <span className={`truncate text-xs ${QUALITY_COLORS[item.quality]}`}>{item.name}</span>
                    <span className="text-[10px] text-amber-400/80">Mail ×1</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-500/80">In transit</h3>
          {(view?.pending.length ?? 0) === 0 ? (
            <p className="text-xs text-stone-500">No pending mail</p>
          ) : (
            view?.pending.map((entry) => (
              <div key={entry.id} className="rounded bg-stone-900/60 px-2 py-1 text-xs text-stone-300">
                {entry.items.map((stack) => `${stack.itemId}×${stack.count}`).join(", ")}
                {entry.ready ? " — ready" : " — delayed"}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function DelveHud() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const session = useKeyedStore(delveStore, userId);
  if (session === null || session.status === "idle") return null;
  return (
    <div className="rounded-md border border-violet-800/70 bg-stone-950/85 px-3 py-2 text-sm text-violet-100 shadow-lg">
      <div className="font-semibold text-violet-200">
        Delve · Chamber {session.chamberIndex + 1}/{session.totalChambers}
      </div>
      <div className="text-xs text-violet-100/80">
        {session.chamberName} · {session.tier} · {session.remaining} left
      </div>
      <div className="mt-1.5 flex gap-2">
        {(session.status === "cleared" || session.status === "complete") && (
          <button
            type="button"
            className="rounded border border-violet-600/70 bg-violet-950/60 px-2 py-0.5 text-[11px] hover:bg-violet-900/60"
            onClick={() => commands.run("delve.advance", {})}
          >
            {session.status === "complete" ? "Claimed" : "Advance"}
          </button>
        )}
        <button
          type="button"
          className="rounded border border-stone-600 bg-stone-900/70 px-2 py-0.5 text-[11px] hover:bg-stone-800"
          onClick={() => commands.run("delve.exit", {})}
        >
          Exit
        </button>
      </div>
    </div>
  );
}

export function ValeCupHud() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const match = useKeyedStore(valeCupStore, userId);
  if (match === null || !match.active) return null;
  return (
    <div className="rounded-md border border-amber-800/70 bg-stone-950/85 px-3 py-2 text-sm text-amber-50 shadow-lg">
      <div className="font-semibold text-amber-200">Vale Cup</div>
      <div className="text-xs">
        Vale {match.scoreHome} – {match.scoreAway} Away · {Math.ceil(match.timeLeft)}s
      </div>
      {match.result !== null && match.result !== "playing" && (
        <div className="text-xs capitalize text-amber-300">{match.result}</div>
      )}
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          className="rounded border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-[11px]"
          onClick={() => commands.run("valecup.kick", { dirX: 0, dirZ: -1 })}
        >
          Kick
        </button>
        <button
          type="button"
          className="rounded border border-stone-600 bg-stone-900/70 px-2 py-0.5 text-[11px]"
          onClick={() => commands.run("valecup.leave", {})}
        >
          Leave
        </button>
      </div>
    </div>
  );
}

export function YumiHud() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const session = useKeyedStore(yumiStore, userId);
  if (session === null || !session.active) return null;
  const frac = session.yumiMaxHp > 0 ? session.yumiHp / session.yumiMaxHp : 0;
  return (
    <div className="rounded-md border border-pink-800/70 bg-stone-950/85 px-3 py-2 text-sm text-pink-50 shadow-lg">
      <div className="font-semibold text-pink-200">Protect Yumi</div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-stone-900">
        <div className="h-full bg-pink-500" style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
      </div>
      <div className="mt-1 text-xs text-pink-100/80">
        Wave {session.wave} · {session.alive} hostiles · {session.status}
      </div>
      <button
        type="button"
        className="mt-1.5 rounded border border-stone-600 bg-stone-900/70 px-2 py-0.5 text-[11px]"
        onClick={() => commands.run("yumi.leave", {})}
      >
        Leave
      </button>
    </div>
  );
}
