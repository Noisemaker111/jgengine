/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";

import { navigate } from "../../screens/screenRouter";
import { MAIN_MENU_ACCOUNT_CHIP_KIND, useMainMenuAccountChipVm, type MainMenuAccountChipVm } from "../../auth";
import { SITE_TAGLINE } from "../../seo/siteSeo";
import { Backdrop, Button, C, FULL, Icon, Logo, Muted, Row, Text, useCompact } from "../../ui/kit";
import { DISPLAY } from "../../ui/theme";

interface MainMenuLayoutProps {
  children: ReactNode;
  /** Optional hero column shown beside the menu on large screens (home intro, etc.). */
  intro?: ReactNode;
  backTo?: string;
  overlay?: ReactNode;
  /** Hide the top logo / account header row (title-screen style). */
  hideHeader?: boolean;
}

const TICKER = ["TFLOP pool online", "inference queue idle", "garage tier unlocked", "co-op sync ready", "tokenizer warm", "cooling nominal"] as const;
const PARTICLES = [[0.08, 0.22, 4], [0.18, 0.68, 3], [0.72, 0.18, 5], [0.84, 0.55, 3], [0.46, 0.78, 4], [0.58, 0.32, 3]] as const;

/** Ambient lab-floor dressing behind the menu: drifting teal motes and a status ticker. */
function Atmosphere() {
  const { width, height } = useRuneViewport();
  return <RuneView anchor="fill">
    {PARTICLES.map(([x, y, size], index) => <RuneView key={index} pin={[x * width, y * height, null, null]} width={size} height={size} radius={size} fill="#5fc2a880" />)}
    {useCompact() ? null : <RuneView anchor="bottom" inset={72}>
      <Row gap={32}>{TICKER.map((item) => <Text key={item} size={10} weight={700} tracking={2.6} color="#5fc2a859">{item.toUpperCase()}</Text>)}</Row>
    </RuneView>}
  </RuneView>;
}

function AccountChip({ account }: { account: MainMenuAccountChipVm }) {
  if (account.kind === MAIN_MENU_ACCOUNT_CHIP_KIND.signedOut) return null;
  if (account.kind === MAIN_MENU_ACCOUNT_CHIP_KIND.guest) return <RuneView items="end" gap={6}>
    <Muted size={11} weight={700}>Playing as guest — progress won't be saved</Muted>
    <Button tone="primary" icon="logIn" onPress={() => void navigate({ to: "/login" })}>Sign in to save</Button>
  </RuneView>;
  const body = <>
    <RuneView width={40} height={40} radius={20} border={{ width: 2, color: "#5fc2a880" }} justify="center" items="center"><Icon name="user" size={20} color={C.teal} /></RuneView>
    <RuneView gap={2}>
      <Text family={DISPLAY} size={13} weight={800} color={C.cream}>{account.displayLine}</Text>
      <Text size={11} weight={700} color={C.teal}>{account.kind === MAIN_MENU_ACCOUNT_CHIP_KIND.profileLink ? `@${account.username}` : "Loading…"}</Text>
    </RuneView>
  </>;
  return account.kind === MAIN_MENU_ACCOUNT_CHIP_KIND.profileLink
    ? <Button tone="chip" label={`Profile @${account.username}`} padding={[6, 14, 6, 6]} onPress={() => void navigate({ to: "/profile/$username", params: { username: account.username } })}>{body}</Button>
    : <Row padding={[6, 14, 6, 6]} radius={999} fill="#ffffff0d">{body}</Row>;
}

/** The menu pages' frame (home, about, profile), drawn with the account it is handed. */
export function MainMenuLayoutView({ account, children, intro, backTo, overlay, hideHeader = false }: MainMenuLayoutProps & { account: MainMenuAccountChipVm }) {
  const { width, height } = useRuneViewport();
  const compact = useCompact();
  const pad = compact ? 16 : 40;
  const wide = intro !== undefined && width >= 1024;
  const middle = height - pad * 2 - (hideHeader ? 70 : compact ? 140 : 170);
  return <RuneView anchor="fill">
    <Backdrop />
    <Atmosphere />
    <RuneView anchor="fill" safe padding={pad} gap={compact ? 12 : 20}>
      <Row justify={hideHeader ? "end" : "between"} items="start" width={FULL}>
        {hideHeader ? null : <RuneView gap={12}>
          {backTo === undefined ? null : <Button tone="link" icon="back" onPress={() => void navigate({ to: backTo })}>Back</Button>}
          <Button tone="link" label="LLMville home" padding={0} onPress={() => void navigate({ to: "/" })}><Logo size={compact ? "sm" : "md"} tagline={!compact} /></Button>
        </RuneView>}
        <AccountChip account={account} />
      </Row>
      <RuneView grow={1} width={FULL} scroll maxHeight={middle}>
        {/* A scrolling view stacks its children in a plain column; this row centres the menu inside it. */}
        <RuneView width={FULL} minHeight={middle} items="center" justify={intro === undefined ? "center" : "start"}>
          <RuneView layout={wide ? "row" : "stack"} gap={wide ? 40 : 24} items={wide ? "start" : "center"} width={intro === undefined ? Math.min(384, width - pad * 2) : Math.min(1152, width - pad * 2)}>
            {intro === undefined ? null : <RuneView grow={1} shrink>{intro}</RuneView>}
            <RuneView width={intro === undefined ? FULL : Math.min(340, width - pad * 2)}>{children}</RuneView>
          </RuneView>
        </RuneView>
      </RuneView>
      <Row justify={hideHeader ? "center" : "between"} width={FULL}>
        {hideHeader ? <Muted size={11} weight={700} color={C.faint}>© 2026 LLMville</Muted> : <>
          <Row gap={8}><RuneView width={8} height={8} radius={4} fill={C.teal} shadow={{ y: 0, blur: 8, color: "#5fc2a8b3" }} /><Muted size={11} weight={700} color={C.faint}>{SITE_TAGLINE}</Muted></Row>
          <Muted size={11} weight={700} color={C.faint}>llmville.com</Muted>
        </>}
      </Row>
    </RuneView>
    {overlay}
  </RuneView>;
}

export function MainMenuLayout(props: MainMenuLayoutProps) {
  return <MainMenuLayoutView {...props} account={useMainMenuAccountChipVm()} />;
}
