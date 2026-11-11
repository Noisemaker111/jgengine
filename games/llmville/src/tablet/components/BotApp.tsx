/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "@llmville/backend/convex/_generated/api";
import { useAuth } from "../../auth";
import { env } from "../../webEnv";
import { Button, C, ErrorText, Field, FULL, Label, Muted, Panel, Row, Stack, Text } from "../../ui/kit";

const AGENT_API_PATH = "/agent/api/v1";

function agentApiBaseUrl(): string {
  return `${env.VITE_CONVEX_SITE_URL.replace(/\/$/, "")}${AGENT_API_PATH}`;
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return <Panel shell="inset" width={FULL} gap={10}>
    {title === undefined ? null : <Label>{title.toUpperCase()}</Label>}
    {children}
  </Panel>;
}

/** The new bot token, shown once with copy and done. */
function TokenReveal({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [token]);
  return <Section title="Bot token — shown once">
    <Muted size={13}>{`Give this token to your program or LLM. It authenticates your bot at ${agentApiBaseUrl()}. Store it now — it will not be shown again.`}</Muted>
    <RuneView padding={12} radius={8} fill="#00000066" width={FULL}><Text mono size={12} color="#6ee7b7">{token}</Text></RuneView>
    <Row gap={8}>
      <Button tone="primary" onPress={copy}>{copied ? "Copied" : "Copy token"}</Button>
      <Button tone="ghost" onPress={onDismiss}>Done</Button>
    </Row>
  </Section>;
}

/** Players banned from walking into this lab, and a username box to ban one more. */
export function VisitorBansView({ bans, ban, unban }: {
  bans: readonly { externalId: string; username?: string | null | undefined; displayName?: string | null | undefined }[] | undefined;
  ban: (username: string) => Promise<{ banned: boolean; reason?: string | null | undefined }>;
  unban: (externalId: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const onBan = useCallback(async () => {
    const name = username.trim();
    if (!name) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await ban(name);
      if (result.banned) setUsername("");
      else setMessage(result.reason ?? "Could not ban that player.");
    } finally {
      setBusy(false);
    }
  }, [ban, username]);
  return <Section title="Visitors">
    <Muted size={13}>Anyone signed in can walk into your lab while you're online. Ban a player to keep them — and their bot — out.</Muted>
    <Row gap={8} width={FULL}>
      <RuneView grow={1} shrink><Field value={username} onChange={setUsername} onSubmit={() => void onBan()} placeholder="username" label="Ban username" maxLength={40} /></RuneView>
      <Button tone="primary" disabled={busy || username.trim().length === 0} label="Ban player" onPress={() => void onBan()}>{busy ? "Banning…" : "Ban"}</Button>
    </Row>
    {message === null ? null : <ErrorText>{message}</ErrorText>}
    {bans === undefined ? <Muted size={13}>Loading bans…</Muted> : bans.length === 0 ? <Muted size={13}>No one is banned.</Muted>
      : bans.map((entry) => {
        const name = entry.username ? `@${entry.username}` : entry.displayName ?? entry.externalId;
        return <Row key={entry.externalId} justify="between" width={FULL} padding={[8, 12, 8, 12]} radius={8} fill="#0000004d">
          <Text size={13}>{name}</Text>
          <Button tone="ghost" label={`Unban ${name}`} onPress={() => unban(entry.externalId)}>Unban</Button>
        </Row>;
      })}
  </Section>;
}

function VisitorBans() {
  const bans = useQuery(api.world.listPlotBans, {});
  const banVisitor = useMutation(api.world.banVisitor);
  const unbanVisitor = useMutation(api.world.unbanVisitor);
  return <VisitorBansView bans={bans} ban={(username) => banVisitor({ username })} unban={(externalId) => void unbanVisitor({ externalId })} />;
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
  const onConnect = useCallback(() => runAction(async () => (await connectBot({})).token), [connectBot, runAction]);
  const onRotate = useCallback(() => runAction(async () => (await rotateBotToken({})).token), [rotateBotToken, runAction]);
  const onDisconnect = useCallback(() => runAction(async () => { await disconnectBot({}); setToken(null); return null; }), [disconnectBot, runAction]);

  if (!isConvexAuthenticated || isAnonymous) {
    return <Section title="LLM Bot"><Muted size={13}>Sign in with an account to connect an LLM bot to your lab. Guest sessions can't own a bot.</Muted></Section>;
  }
  return <Stack gap={14} width={FULL}>
    <Section title="LLM Bot">
      <Muted size={13}>Connect one bot to your plot, then hand its token to your own program or an LLM. The bot plays through the agent API, scoped only to your lab.</Muted>
      <Text size={12} color={C.faint}>{`Agent API base URL: ${agentApiBaseUrl()}`}</Text>
    </Section>
    {bot === undefined ? <Section><Muted size={13}>Loading bot status…</Muted></Section>
      : bot === null ? <Section title="No bot connected"><Button tone="primary" disabled={busy} onPress={() => void onConnect()}>{busy ? "Connecting…" : "Connect bot"}</Button></Section>
        : <Section title={`Connected — ${bot.name}`}>
          <Row justify="between" width={FULL}><Muted size={13}>Connected</Muted><Text size={13}>{new Date(bot.createdAt).toLocaleString()}</Text></Row>
          <Row justify="between" width={FULL}><Muted size={13}>Last active</Muted><Text size={13}>{bot.lastSeenAt !== null ? new Date(bot.lastSeenAt).toLocaleString() : "Never"}</Text></Row>
          <Row gap={8}>
            <Button tone="ghost" disabled={busy} onPress={() => void onRotate()}>{busy ? "Working…" : "Rotate token"}</Button>
            <Button tone="secondary" disabled={busy} onPress={() => void onDisconnect()}>Disconnect</Button>
          </Row>
        </Section>}
    {token === null ? null : <TokenReveal token={token} onDismiss={() => setToken(null)} />}
    {error === null ? null : <ErrorText>{error}</ErrorText>}
    <VisitorBans />
  </Stack>;
}
