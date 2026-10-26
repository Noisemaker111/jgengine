import type { ReactNode } from "react";

/**
 * Blocking join feedback; callers may supply their own copy and classes.
 * @capability join-gate block gameplay until joined and show failures with retry
 */
export function JoinGate({ status, failureReason, retry, joiningLabel = "Joining world…", failedLabel = "Unable to join", retryLabel = "Retry", className, children, renderJoining, renderFailure }: {
  status: "joining" | "joined" | "failed";
  failureReason?: string | null;
  retry: () => void;
  joiningLabel?: ReactNode;
  failedLabel?: ReactNode;
  retryLabel?: ReactNode;
  className?: string;
  children?: ReactNode;
  renderJoining?: () => ReactNode;
  renderFailure?: (reason: string | null, retry: () => void) => ReactNode;
}) {
  if (status === "joined") return children;
  if (status === "joining" && renderJoining) return renderJoining();
  if (status === "failed" && renderFailure) return renderFailure(failureReason ?? null, retry);
  return <div className={className} data-join-gate={status} style={{ display: "grid", placeContent: "center", textAlign: "center", width: "100%", height: "100%", background: "var(--jg-surface, #171717)", color: "var(--jg-text, #fafafa)" }}>
    <p role={status === "failed" ? "alert" : "status"}>{status === "failed" ? failedLabel : joiningLabel}</p>
    {status === "failed" && <><p>{failureReason}</p><button type="button" onClick={retry}>{retryLabel}</button></>}
  </div>;
}
