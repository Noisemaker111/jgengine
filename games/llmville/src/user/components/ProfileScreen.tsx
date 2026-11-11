/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { navigate } from "../../screens/screenRouter";
import { useMainMenuAccountChipVm, type MainMenuAccountChipVm } from "../../auth";
import { formatCompactNumber, formatMoney } from "../../economy/economy";
import { MainMenuLayoutView } from "../../runtime/components/MainMenuLayout";
import { Button, C, ErrorText, Field, FULL, Heading, Icon, Label, Muted, Panel, Row, Text } from "../../ui/kit";
import type { IconName } from "../../ui/icons";
import { DISPLAY } from "../../ui/theme";
import { getAvatarById, getMentorPerkSummary, sanitizeProfileUsernameKeystroke, useProfileScreen } from "../user";

export type ProfileVm = ReturnType<typeof useProfileScreen>;

function Stat({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone: string }) {
  return <Panel shell="inset" layout="row" gap={10} items="center" grow={1}>
    <Icon name={icon} size={16} color={tone} />
    <RuneView gap={2}><Label size={10}>{label.toUpperCase()}</Label><Text family={DISPLAY} size={18} weight={800} color={tone}>{value}</Text></RuneView>
  </Panel>;
}

export function ProfileScreenView({ account, usernameParam, vm }: { account: MainMenuAccountChipVm; usernameParam: string; vm: ProfileVm }) {
  const { isLoading, publicProfile, isOwnProfile, isEditing, setIsEditing, username, setUsername, saving, error, usernameTaken, checkingUsername, handleSave, handleCancel, logout, disableSave } = vm;
  if (isLoading) return <MainMenuLayoutView account={account} backTo="/">
    <RuneView items="center" gap={12} padding={[40, 0, 40, 0]}><Icon name="spinner" size={32} color={C.teal} /><Muted size={14}>Loading profile…</Muted></RuneView>
  </MainMenuLayoutView>;
  if (publicProfile == null) return <MainMenuLayoutView account={account} backTo="/">
    <Panel width={FULL} items="center" gap={12} padding={28}>
      <Heading size={20}>Profile not found</Heading>
      <Muted size={14} align="center">That username may have changed or doesn't exist.</Muted>
      <Button tone="primary" onPress={() => void navigate({ to: "/" })}>Back home</Button>
    </Panel>
  </MainMenuLayoutView>;
  const handle = publicProfile.username ?? usernameParam;
  const mentor = getAvatarById(publicProfile.avatarId);
  const lab = publicProfile.lab;
  return <MainMenuLayoutView account={account} backTo="/">
    <Panel width={FULL} gap={20} padding={24} label={`Profile @${handle}`}>
      {isOwnProfile && isEditing ? <RuneView gap={6} width={FULL}>
        <Field label="Public handle" value={username} maxLength={24} placeholder="username"
          onChange={(text) => setUsername(sanitizeProfileUsernameKeystroke(text))}
          onSubmit={() => { if (!disableSave) void handleSave(); }} />
        {usernameTaken ? <ErrorText size={12}>Username is already taken</ErrorText> : checkingUsername ? <Muted size={12}>Checking availability…</Muted> : null}
      </RuneView> : <RuneView items="center" gap={4} width={FULL}>
        <Text family={DISPLAY} size={30} weight={800}>{`@${handle}`}</Text>
        <Text size={14} weight={600} color={C.teal}>{`Mentor: ${mentor.name} · ${mentor.perkTitle}`}</Text>
        <Muted size={12} align="center" color={C.faint}>{getMentorPerkSummary(publicProfile.avatarId)}</Muted>
      </RuneView>}
      {lab ? <RuneView gap={10} width={FULL}>
        <RuneView items="center" gap={2}><Label>PUBLIC LAB STATS</Label><Text family={DISPLAY} size={14} weight={800} color={C.muted}>{lab.name}</Text></RuneView>
        <RuneView layout="grid" columns={2} gap={8} width={FULL}>
          <Stat icon="coins" label="Cash" value={`$${formatMoney(lab.cash)}`} tone={C.amber} />
          <Stat icon="sparkles" label="Data tokens" value={formatCompactNumber(lab.dataTokens)} tone={C.teal} />
          <Stat icon="cpu" label="Models serving" value={String(lab.modelsServing)} tone={C.cream} />
          <Stat icon="users" label="Models trained" value={String(lab.modelsTrained)} tone={C.coral} />
        </RuneView>
        {lab.topBenchmark > 0 ? <Text size={12} weight={700} color={C.teal} align="center">{`Top benchmark score: ${Math.round(lab.topBenchmark)}`}</Text> : null}
      </RuneView> : <Panel shell="inset" width={FULL} items="center"><Muted size={14}>No public lab yet.</Muted></Panel>}
      {error ? <ErrorText align="center">{error}</ErrorText> : null}
      {isOwnProfile ? (isEditing ? <Row width={FULL} gap={8}>
        <Button tone="ghost" icon="close" grow={1} onPress={handleCancel}>Cancel</Button>
        <Button tone="primary" icon="check" grow={1} busy={saving} busyLabel="Saving…" disabled={disableSave} onPress={() => void handleSave()}>Save</Button>
      </Row> : <Button tone="ghost" icon="pencil" width={FULL} onPress={() => setIsEditing(true)}>Edit handle</Button>) : null}
      {isOwnProfile ? <RuneView items="center" width={FULL}><Button tone="link" icon="logOut" color={C.faint} onPress={() => void logout()}>Sign out</Button></RuneView> : null}
    </Panel>
  </MainMenuLayoutView>;
}

/** How long typing must pause before the handle is checked against taken names. */
const USERNAME_CHECK_DELAY_MS = 500;

export function ProfileScreen({ username }: { username: string }) {
  const vm = useProfileScreen({ usernameParam: username });
  const { username: draft, setUsernameCheck, isEditing } = vm;
  useEffect(() => {
    if (!isEditing) return;
    const timer = setTimeout(() => setUsernameCheck(draft), USERNAME_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, isEditing, setUsernameCheck]);
  return <ProfileScreenView account={useMainMenuAccountChipVm()} usernameParam={username} vm={vm} />;
}
