/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-multiplayer
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { ShellScreen } from "@jgengine/core/ui/rune/shellScreens.view";

/**
 * Blocking join feedback, drawn on Rune; callers may supply their own copy or their own screens.
 * @capability join-gate block gameplay until joined and show failures with retry
 */
export function JoinGate({ status, failureReason, retry, joiningLabel = "Joining world…", failedLabel = "Unable to join", retryLabel = "Retry", children, renderJoining, renderFailure }: {
  status: "joining" | "joined" | "failed";
  failureReason?: string | null;
  retry: () => void;
  joiningLabel?: string;
  failedLabel?: string;
  retryLabel?: string;
  children?: ReactNode;
  renderJoining?: () => ReactNode;
  renderFailure?: (reason: string | null, retry: () => void) => ReactNode;
}) {
  if (status === "joined") return children;
  if (status === "joining" && renderJoining) return renderJoining();
  if (status === "failed" && renderFailure) return renderFailure(failureReason ?? null, retry);
  return status === "failed"
    ? <ShellScreen title={failedLabel} body={failureReason ?? "The world did not answer."} primary={{ label: retryLabel, run: retry }} />
    : <ShellScreen title={joiningLabel} body="Connecting to the world's server." />;
}
