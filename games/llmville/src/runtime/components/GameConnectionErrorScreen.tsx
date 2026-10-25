import { api } from "@llmville/backend/convex/_generated/api";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BUTTON_VARIANT, Button } from "@/components/ui/button";
import { PANEL_VARIANT, Panel } from "@/components/ui/panel";
import { StandalonePageShell } from "@/branding/components/StandalonePageShell";
import {
  buildGameErrorReportInput,
  formatGameErrorAgentPrompt,
  gameErrorPanelLabel,
  serializeGameErrorReportPayload,
  type GameErrorKind,
  type GameErrorReportInput,
} from "@/runtime/gameErrorReport";

interface GameConnectionErrorScreenProps {
  message: string;
  homeHref?: string;
  kind?: GameErrorKind;
  stack?: string | null;
  componentStack?: string | null;
  report?: GameErrorReportInput;
  onRetry?: () => void;
}

type CopyState = "idle" | "copied" | "failed";
type SendState = "idle" | "sending" | "sent" | "failed";

export function GameConnectionErrorScreen({
  message,
  homeHref = "/",
  kind,
  stack,
  componentStack,
  report,
  onRetry,
}: GameConnectionErrorScreenProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [sendState, setSendState] = useState<SendState>("idle");
  const submitErrorReport = useMutation(api.clientErrors.submit);

  const resolvedReport = useMemo(
    () =>
      report
      ?? buildGameErrorReportInput(message, { kind, stack, componentStack }),
    [componentStack, kind, message, report, stack],
  );

  const panelLabel = gameErrorPanelLabel(resolvedReport.kind);
  const agentPrompt = useMemo(
    () => formatGameErrorAgentPrompt(resolvedReport),
    [resolvedReport],
  );
  const reportPayload = useMemo(
    () => serializeGameErrorReportPayload(resolvedReport),
    [resolvedReport],
  );

  useEffect(() => {
    if (import.meta.env.DEV) return;
    console.error("[LLMville client error]", resolvedReport, agentPrompt);
  }, [agentPrompt, resolvedReport]);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [agentPrompt]);

  const sendReport = useCallback(async () => {
    setSendState("sending");
    try {
      const result = await submitErrorReport(reportPayload);
      setSendState(result.ok ? "sent" : "failed");
    } catch {
      setSendState("failed");
    }
  }, [reportPayload, submitErrorReport]);

  const copyLabel =
    copyState === "copied"
      ? "Copied for agent"
      : copyState === "failed"
        ? "Copy failed"
        : import.meta.env.DEV
          ? "Copy for agent"
          : "Copy details";

  const sendLabel =
    sendState === "sending"
      ? "Sending report..."
      : sendState === "sent"
        ? "Report sent"
        : sendState === "failed"
          ? "Send failed — retry"
          : "Send error report";

  return (
    <StandalonePageShell centered className="z-[100]">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
        <Panel variant={PANEL_VARIANT.terminal} label={panelLabel} className="p-8 text-center">
          <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center border border-[#d9544a]/35 bg-[#d9544a]/10">
            <svg className="relative h-8 w-8 text-[#f0a097]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <div className="mb-6 border border-[#d9544a]/25 bg-[#d9544a]/8 p-4 text-left">
            <p className="mb-1 text-xs font-semibold text-[#f0a097]/70">Details</p>
            <p className="text-sm leading-relaxed text-brand-cream/85">{message}</p>
          </div>

          <div className="flex flex-col gap-3">
            {import.meta.env.DEV ? (
              <Button
                type="button"
                variant={BUTTON_VARIANT.secondary}
                onClick={() => void copyPrompt()}
                className="w-full py-3"
              >
                {copyLabel}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant={BUTTON_VARIANT.primary}
                  onClick={() => void sendReport()}
                  disabled={sendState === "sending" || sendState === "sent"}
                  className="w-full py-3"
                >
                  {sendLabel}
                </Button>
                <Button
                  type="button"
                  variant={BUTTON_VARIANT.secondary}
                  onClick={() => void copyPrompt()}
                  className="w-full py-3"
                >
                  {copyLabel}
                </Button>
              </>
            )}
            <Button type="button" variant={BUTTON_VARIANT.terminal} onClick={onRetry ?? (() => window.location.reload())} className="w-full py-3 text-[#f0a097]">
              Retry
            </Button>
            <Link to={homeHref} className="game-btn game-btn--secondary w-full py-3 text-center text-sm">
              Back to main menu
            </Link>
          </div>
        </Panel>
      </div>
    </StandalonePageShell>
  );
}