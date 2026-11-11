/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { navigate } from "../../screens/screenRouter";
import { useDashboardScreenState, type DashboardScreenPhase } from "../../auth";
import { Button, C, FULL, Heading, Icon, Label, Logo, Muted, Page, Panel, Row, Text } from "../../ui/kit";

export interface DashboardVm {
  phase: DashboardScreenPhase;
  displayName: string;
  email: string;
  username: string | null;
  logout: () => void;
}

function AccountLine({ label, value, color = C.cream }: { label: string; value: string; color?: string }) {
  return <Row justify="between" width={FULL} gap={16}><Muted size={12} weight={700} color={C.faint}>{label}</Muted><Text size={14} weight={700} color={color}>{value}</Text></Row>;
}

export function DashboardScreenView({ vm }: { vm: DashboardVm }) {
  if (vm.phase === "loading") return <Page><RuneView items="center" gap={12}><Icon name="spinner" size={32} color={C.teal} /><Muted size={14}>Loading account…</Muted></RuneView></Page>;
  const signedIn = vm.phase === "signed_in";
  const guest = vm.phase === "guest";
  return <Page maxWidth={signedIn ? 512 : 448}>
    <RuneView items="center" gap={12}>
      <Logo stacked size="md" />
      <Muted size={14} weight={600}>{signedIn ? "Signed in and ready to build." : guest ? "Playing as guest — progress won't be saved." : "Sign in to sync your lab across devices."}</Muted>
    </RuneView>
    <Panel shell="terminal" width={FULL} gap={18} padding={28} label="Account">
      <Label color={C.teal} tracking={2}>ACCOUNT</Label>
      <Heading size={24} align="center">Account</Heading>
      {signedIn ? <>
        <Panel shell="inset" width={FULL} gap={10}>
          <AccountLine label="Display name" value={vm.displayName} />
          <AccountLine label="Email" value={vm.email} />
          {vm.username === null || vm.username === "" ? null : <AccountLine label="Username" value={`@${vm.username}`} color={C.teal} />}
        </Panel>
        <RuneView layout="row" responsive={{ phone: { layout: "stack" } }} gap={10} width={FULL}>
          <Button tone="primary" grow={1} onPress={() => void navigate({ to: "/" })}>Back home</Button>
          <Button tone="ghost" grow={1} onPress={vm.logout}>Sign out</Button>
        </RuneView>
      </> : <>
        <Muted size={14} align="center">{guest ? "Sign in to save your progress." : "You are not signed in yet."}</Muted>
        <RuneView layout="row" responsive={{ phone: { layout: "stack" } }} gap={10} width={FULL}>
          <Button tone="primary" grow={1} onPress={() => void navigate({ to: "/login" })}>Sign in</Button>
          <Button tone="secondary" grow={1} onPress={() => void navigate({ to: "/signup" })}>Sign up</Button>
        </RuneView>
      </>}
    </Panel>
  </Page>;
}

export function DashboardScreen() {
  const { phase, logout, displayName, email, username } = useDashboardScreenState();
  return <DashboardScreenView vm={{ phase, displayName, email, username: username ?? null, logout: () => void logout() }} />;
}
