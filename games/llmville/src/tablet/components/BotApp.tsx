import { useCallback, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "@llmville/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { InsetSection } from "@/components/ui/inset-section";
import { useAuth } from "@/auth";
import { env } from "@/webEnv";

const AGENT_API_PATH = "/agent/api/v1";

function agentApiBaseUrl(): string {
  return `${env.VITE_CONVEX_SITE_URL.replace(/\/$/, "")}${AGENT_API_PATH}`;
}

function TokenReveal({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [token]);

  return (
    <InsetSection label="Bot token — shown once">
      <p className="text-sm text-white/70">
        Give this token to your program or LLM. It authenticates your bot at{" "}
        <span className="font-mono text-white/90">{agentApiBaseUrl()}</span>. Store it now — it will not be
        shown again.
      </p>
      <code className="block max-h-32 overflow-auto break-all rounded-md bg-black/40 p-3 font-mono text-xs text-emerald-300">
        {token}
      </code>
      <div className="flex gap-2">
        <Button variant="primary" onClick={copy}>
          {copied ? "Copied" : "Copy token"}
        </Button>
        <Button variant="secondary" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </InsetSection>
  );
}

function VisitorBans() {
  const bans = useQuery(api.world.listPlotBans, {});
  const banVisitor = useMutation(api.world.banVisitor);
  const unbanVisitor = useMutation(api.world.unbanVisitor);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onBan = useCallback(async () => {
    const name = username.trim();
    if (!name) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await banVisitor({ username: name });
      if (result.banned) {
        setUsername("");
      } else {
        setMessage(result.reason ?? "Could not ban that player.");
      }
    } finally {
      setBusy(false);
    }
  }, [banVisitor, username]);

  return (
    <InsetSection label="Visitors">
      <p className="text-sm text-white/70">
        Anyone signed in can walk into your lab while you're online. Ban a player to keep them — and their
        bot — out.
      </p>
      <div className="flex gap-2">
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void onBan();
            }
          }}
          placeholder="username"
          className="min-w-0 flex-1 rounded-md bg-black/40 px-3 py-2 font-mono text-sm text-white/90 outline-none placeholder:text-white/30"
        />
        <Button variant="primary" onClick={() => void onBan()} disabled={busy || username.trim().length === 0}>
          {busy ? "Banning…" : "Ban"}
        </Button>
      </div>
      {message !== null && <p className="text-sm text-red-400">{message}</p>}
      {bans === undefined ? (
        <p className="text-sm text-white/50">Loading bans…</p>
      ) : bans.length === 0 ? (
        <p className="text-sm text-white/50">No one is banned.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bans.map((ban) => (
            <li
              key={ban.externalId}
              className="flex items-center justify-between gap-2 rounded-md bg-black/30 px-3 py-2"
            >
              <span className="truncate text-sm text-white/80">
                {ban.username ? `@${ban.username}` : ban.displayName ?? ban.externalId}
              </span>
              <Button variant="secondary" onClick={() => void unbanVisitor({ externalId: ban.externalId })}>
                Unban
              </Button>
            </li>
          ))}
        </ul>
      )}
    </InsetSection>
  );
}

export function BotApp() {
  const { isConvexAuthenticated, isAnonymous } = useAuth();

  const bot = useQuery(api.bots.getMyBot, isConvexAuthenticated ? {} : "skip");
  const connectBot = useAction(api.bots.connectBot);
  const rotateBotToken = useAction(api.bots.rotateBotToken);
  const disconnectBot = useMutation(api.bots.disconnectBot);

  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAction = useCallback(async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    try {
      const nextToken = await action();
      if (nextToken !== null) setToken(nextToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

  const onConnect = useCallback(
    () => runAction(async () => (await connectBot({})).token),
    [connectBot, runAction],
  );
  const onRotate = useCallback(
    () => runAction(async () => (await rotateBotToken({})).token),
    [rotateBotToken, runAction],
  );
  const onDisconnect = useCallback(
    () =>
      runAction(async () => {
        await disconnectBot({});
        setToken(null);
        return null;
      }),
    [disconnectBot, runAction],
  );

  if (!isConvexAuthenticated || isAnonymous) {
    return (
      <div className="flex flex-col gap-4 pb-24">
        <InsetSection label="LLM Bot">
          <p className="text-sm text-white/70">
            Sign in with an account to connect an LLM bot to your lab. Guest sessions can't own a bot.
          </p>
        </InsetSection>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <InsetSection label="LLM Bot">
        <p className="text-sm text-white/70">
          Connect one bot to your plot, then hand its token to your own program or an LLM. The bot plays
          through the agent API, scoped only to your lab.
        </p>
        <p className="text-xs text-white/50">
          Agent API base URL: <span className="font-mono text-white/80">{agentApiBaseUrl()}</span>
        </p>
      </InsetSection>

      {bot === undefined ? (
        <InsetSection>
          <p className="text-sm text-white/60">Loading bot status…</p>
        </InsetSection>
      ) : bot === null ? (
        <InsetSection label="No bot connected">
          <Button variant="primary" onClick={onConnect} disabled={busy}>
            {busy ? "Connecting…" : "Connect bot"}
          </Button>
        </InsetSection>
      ) : (
        <InsetSection label={`Connected — ${bot.name}`}>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-white/50">Connected</dt>
            <dd className="text-white/80">{new Date(bot.createdAt).toLocaleString()}</dd>
            <dt className="text-white/50">Last active</dt>
            <dd className="text-white/80">
              {bot.lastSeenAt !== null ? new Date(bot.lastSeenAt).toLocaleString() : "Never"}
            </dd>
          </dl>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onRotate} disabled={busy}>
              {busy ? "Working…" : "Rotate token"}
            </Button>
            <Button variant="default" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </Button>
          </div>
        </InsetSection>
      )}

      {token !== null && <TokenReveal token={token} onDismiss={() => setToken(null)} />}

      {error !== null && <p className="text-sm text-red-400">{error}</p>}

      <VisitorBans />
    </div>
  );
}
