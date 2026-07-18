import {
  isNetworkMultiplayerConfigured,
  type EditorNetworkPresenceActor,
  type EditorNetworkSnapshot,
} from "../networkSnapshot";
import { MICRO_LABEL, NUMERIC } from "./theme";
import { EmptyState } from "./ui";

function formatCoord(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "—";
}

function formatSeen(lastSeenAt: number | undefined, nowMs: number): string {
  if (lastSeenAt === undefined) return "—";
  const ageSec = Math.max(0, (nowMs - lastSeenAt) / 1000);
  if (ageSec < 1) return "just now";
  if (ageSec < 60) return `${ageSec.toFixed(0)}s ago`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  return new Date(lastSeenAt).toLocaleTimeString();
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] py-1 last:border-b-0">
      <span className="text-[10px] uppercase tracking-wider text-neutral-600">{label}</span>
      <span className={`min-w-0 truncate text-right text-[11px] text-neutral-200 ${NUMERIC}`}>{value}</span>
    </div>
  );
}

function PresenceRow({ actor, nowMs }: { actor: EditorNetworkPresenceActor; nowMs: number }) {
  const pos = actor.position;
  return (
    <li className="rounded-[6px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/90" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-neutral-100">{actor.userId}</span>
        <span className={`shrink-0 text-[9px] text-neutral-600 ${NUMERIC}`}>{formatSeen(actor.lastSeenAt, nowMs)}</span>
      </div>
      <div className={`mt-0.5 text-[10px] text-neutral-500 ${NUMERIC}`}>
        x {formatCoord(pos.x)} · y {formatCoord(pos.y)} · z {formatCoord(pos.z)}
        {actor.rotationY !== undefined ? ` · yaw ${formatCoord(actor.rotationY)}` : null}
      </div>
    </li>
  );
}

function authorityLabel(snapshot: EditorNetworkSnapshot): string {
  if (snapshot.authority === null) return "single-player";
  if (snapshot.authority === "server") return "server (host-authoritative)";
  return "client (presence-only)";
}

/**
 * Network workspace panel: inspects the game's declared multiplayer adapter and optional
 * host-injected presence/session snapshot. Missing presence is an honest empty state — never
 * fabricated actors or latency.
 *
 * @internal — mounted by `EditorChrome` when the Network workspace is active.
 */
export function NetworkWorkspacePanel({ snapshot }: { snapshot: EditorNetworkSnapshot }) {
  const nowMs = Date.now();
  const multiplayer = isNetworkMultiplayerConfigured(snapshot);
  const online = snapshot.online;
  const hasSession = snapshot.session !== undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-2.5" aria-label="Network workspace">
      <div>
        <div className={MICRO_LABEL}>Session</div>
        <div className="mt-1.5 rounded-[6px] border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5">
          <Field label="Game" value={snapshot.gameId} />
          <Field label="Adapter" value={snapshot.adapterKind} />
          <Field label="Authority" value={authorityLabel(snapshot)} />
          {snapshot.topology !== undefined ? <Field label="Topology" value={snapshot.topology} /> : null}
          {snapshot.endpoint !== undefined ? <Field label="Endpoint" value={snapshot.endpoint} /> : null}
          {hasSession ? (
            <>
              <Field label="User" value={snapshot.session!.userId} />
              {snapshot.session!.serverId !== undefined ? (
                <Field
                  label="Server"
                  value={snapshot.session!.serverId === null ? "(joined, id not reported)" : snapshot.session!.serverId}
                />
              ) : null}
              {snapshot.session!.feedActions !== undefined && snapshot.session!.feedActions.length > 0 ? (
                <Field label="Feeds" value={snapshot.session!.feedActions.join(", ")} />
              ) : null}
            </>
          ) : (
            <Field label="Live session" value={multiplayer ? "not attached" : "n/a (offline)"} />
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 flex items-center gap-2">
          <div className={MICRO_LABEL}>Presence</div>
          {online !== undefined ? (
            <span className={`text-[9px] text-neutral-600 ${NUMERIC}`}>{online.length} online</span>
          ) : null}
          {snapshot.updatedAt !== undefined ? (
            <span className={`ml-auto text-[9px] text-neutral-600 ${NUMERIC}`}>
              updated {formatSeen(snapshot.updatedAt, nowMs)}
            </span>
          ) : null}
        </div>

        {online === undefined ? (
          <EmptyState
            icon="network"
            title="No presence feed"
            description={
              multiplayer
                ? "The host has not supplied a live presence snapshot. Attach a multiplayer backend (Convex/WS) and pass presence rows into the editor — nothing is invented here."
                : "This game is offline / single-player. Presence inspection appears when the game declares a multiplayer adapter and the host injects a session feed."
            }
          />
        ) : online.length === 0 ? (
          <EmptyState
            icon="network"
            title="No players online"
            description="The presence feed is connected but the roster is empty. Other clients will appear here when they sync poses."
          />
        ) : (
          <ul className="min-h-0 flex-1 space-y-1 overflow-auto pr-0.5">
            {online.map((actor) => (
              <PresenceRow key={actor.userId} actor={actor} nowMs={nowMs} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
