/** @jsxImportSource @jgengine/core/ui/jsx */
import { api } from "@llmville/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { navigate } from "../../screens/screenRouter";
import { Button, C, FULL, Icon, Label, Page, Panel, Text } from "../../ui/kit";
import {
  buildGameErrorReportInput,
  formatGameErrorAgentPrompt,
  gameErrorPanelLabel,
  serializeGameErrorReportPayload,
  type GameErrorKind,
  type GameErrorReportInput,
} from "../gameErrorReport";

interface GameConnectionErrorScreenProps {
  message: string;
  homeHref?: string;
  kind?: GameErrorKind | undefined;
  stack?: string | null;
  componentStack?: string | null | undefined;
  report?: GameErrorReportInput;
  onRetry?: () => void;
}

type CopyState = "idle" | "copied" | "failed";
type SendState = "idle" | "sending" | "sent" | "failed";

/** What the error panel shows and the actions it offers; dev builds copy a prompt instead of sending. */
export interface GameErrorScreenVm {
  panelLabel: string;
  message: string;
  dev: boolean;
  copyState: CopyState;
  sendState: SendState;
  copy: () => void;
  send: () => void;
  retry: () => void;
  home: () => void;
}

export function GameErrorScreenView({ vm }: { vm: GameErrorScreenVm }) {
  const copyLabel = vm.copyState === "copied" ? "Copied for agent" : vm.copyState === "failed" ? "Copy failed" : vm.dev ? "Copy for agent" : "Copy details";
  const sendLabel = vm.sendState === "sending" ? "Sending report..." : vm.sendState === "sent" ? "Report sent" : vm.sendState === "failed" ? "Send failed — retry" : "Send error report";
  return <Page maxWidth={448}>
    <Panel shell="terminal" width={FULL} items="center" gap={18} padding={28} label={vm.panelLabel}>
      <Label color={C.error} tracking={2}>{vm.panelLabel.toUpperCase()}</Label>
      <RuneView width={64} height={64} justify="center" items="center" fill="#d9544a1a" border={{ width: 1, color: "#d9544a59" }}><Icon name="warning" size={32} color={C.error} strokeWidth={1.5} /></RuneView>
      <RuneView width={FULL} padding={16} gap={4} fill="#d9544a14" border={{ width: 1, color: "#d9544a40" }}>
        <Text size={12} weight={700} color="#f0a097b3">Details</Text>
        <Text size={14} color={C.cream}>{vm.message}</Text>
      </RuneView>
      <RuneView width={FULL} gap={10}>
        {vm.dev ? null : <Button tone="primary" width={FULL} disabled={vm.sendState === "sending" || vm.sendState === "sent"} onPress={vm.send}>{sendLabel}</Button>}
        <Button tone="ghost" width={FULL} onPress={vm.copy}>{copyLabel}</Button>
        <Button tone="danger" width={FULL} onPress={vm.retry}>Retry</Button>
        <Button tone="ghost" width={FULL} onPress={vm.home}>Back to main menu</Button>
      </RuneView>
    </Panel>
  </Page>;
}

export function GameConnectionErrorScreen({ message, homeHref = "/", kind, stack, componentStack, report, onRetry }: GameConnectionErrorScreenProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [sendState, setSendState] = useState<SendState>("idle");
  const submitErrorReport = useMutation(api.clientErrors.submit);
  const resolvedReport = useMemo(() => report ?? buildGameErrorReportInput(message, { kind, stack, componentStack }), [componentStack, kind, message, report, stack]);
  const agentPrompt = useMemo(() => formatGameErrorAgentPrompt(resolvedReport), [resolvedReport]);
  const reportPayload = useMemo(() => serializeGameErrorReportPayload(resolvedReport), [resolvedReport]);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    console.error("[LLMville client error]", resolvedReport, agentPrompt);
  }, [agentPrompt, resolvedReport]);
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [agentPrompt]);
  const send = useCallback(async () => {
    setSendState("sending");
    try {
      const result = await submitErrorReport(reportPayload);
      setSendState(result.ok ? "sent" : "failed");
    } catch {
      setSendState("failed");
    }
  }, [reportPayload, submitErrorReport]);

  return <GameErrorScreenView vm={{
    panelLabel: gameErrorPanelLabel(resolvedReport.kind),
    message,
    dev: import.meta.env.DEV,
    copyState,
    sendState,
    copy: () => void copy(),
    send: () => void send(),
    retry: onRetry ?? (() => window.location.reload()),
    home: () => void navigate({ to: homeHref }),
  }} />;
}
