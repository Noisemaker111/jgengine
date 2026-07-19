import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import type { NotificationEntry, NotificationStore } from "@jgengine/core/game/notifications";

/** Subscribe to a notification store's live list. */
export function useNotifications<TMeta = unknown>(store: NotificationStore<TMeta>): readonly NotificationEntry<TMeta>[] {
  return useSyncExternalStore(store.subscribe, store.list, store.list);
}

const KIND_COLOR: Record<string, string> = {
  info: "#38bdf8",
  success: "#4ade80",
  warning: "#f59e0b",
  danger: "#ef4444",
};

function kindColor(kind: string): string {
  return KIND_COLOR[kind] ?? "var(--jg-accent, #94a3b8)";
}

function defaultRelativeTime(at: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Props for {@link NotificationBell}. */
export interface NotificationBellProps {
  store: NotificationStore;
  onClick?: () => void;
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Notification bell — an icon button with an unread-count badge, bound to a
 * notification store. Toggle a {@link NotificationCenter} panel from its click.
 *
 * @capability notification-bell icon button with a live unread-count badge over a notification store
 */
export function NotificationBell({ store, onClick, icon = "🔔", className, style }: NotificationBellProps): ReactNode {
  const list = useNotifications(store);
  const unread = list.reduce((count, entry) => (entry.read ? count : count + 1), 0);
  return (
    <button
      type="button"
      className={className}
      data-notification-bell
      onClick={onClick}
      style={{
        position: "relative",
        width: 40,
        height: 40,
        borderRadius: 10,
        border: "1px solid var(--jg-ring, rgba(148,163,184,0.3))",
        background: "rgba(17,22,30,0.85)",
        color: "#e2e8f0",
        fontSize: 18,
        cursor: "pointer",
        ...style,
      }}
    >
      {icon}
      {unread > 0 ? (
        <span
          data-notification-badge
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            minWidth: 18,
            height: 18,
            padding: "0 4px",
            borderRadius: 9999,
            background: "#ef4444",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}

/** Props for {@link NotificationCenter}. */
export interface NotificationCenterProps {
  store: NotificationStore;
  title?: string;
  emptyLabel?: string;
  onClose?: () => void;
  /** Format an entry's timestamp; default is a relative "2m ago" using the current time. */
  formatTime?: (at: number) => string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Notification center panel — the scrollable log toasts don't provide: newest
 * notifications with a kind-colored marker, title/body, relative time, and an
 * unread highlight; a header with the unread count, mark-all-read, and clear.
 * Clicking an entry marks it read. Bind it to a `createNotificationCenter`.
 *
 * @capability notification-center-panel scrollable notification log with kind markers, read tracking, relative time, and mark-all-read/clear
 */
export function NotificationCenter({
  store,
  title = "Notifications",
  emptyLabel = "You're all caught up.",
  onClose,
  formatTime,
  className,
  style,
}: NotificationCenterProps): ReactNode {
  const list = useNotifications(store);
  const unread = list.reduce((count, entry) => (entry.read ? count : count + 1), 0);
  const nowMs = typeof Date !== "undefined" ? Date.now() : 0;
  const time = formatTime ?? ((at: number) => defaultRelativeTime(at, nowMs));

  const headerButton: CSSProperties = {
    border: "1px solid rgba(148,163,184,0.4)",
    borderRadius: 6,
    background: "transparent",
    color: "rgba(226,232,240,0.85)",
    fontSize: 11,
    padding: "3px 8px",
    cursor: "pointer",
  };

  return (
    <div
      className={className}
      data-notification-center
      style={{
        width: 300,
        maxHeight: 420,
        display: "flex",
        flexDirection: "column",
        borderRadius: 14,
        background: "linear-gradient(160deg, rgba(20,24,32,0.97), rgba(11,14,19,0.97))",
        border: "1px solid var(--jg-ring, rgba(148,163,184,0.32))",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        boxShadow: "0 18px 44px rgba(0,0,0,0.5)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(148,163,184,0.2)" }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
          {title}
          {unread > 0 ? <span style={{ marginLeft: 6, color: "#f87171" }}>({unread})</span> : null}
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <button type="button" data-notification-mark-all style={headerButton} onClick={() => store.markAllRead()}>Mark all read</button>
          <button type="button" data-notification-clear style={headerButton} onClick={() => store.clear()}>Clear</button>
          {onClose !== undefined ? <button type="button" style={headerButton} onClick={onClose}>✕</button> : null}
        </span>
      </div>
      {list.length === 0 ? (
        <p style={{ margin: 0, padding: "16px 12px", fontSize: 12, color: "rgba(148,163,184,0.8)" }}>{emptyLabel}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 6, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {list.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                data-notification={entry.id}
                data-kind={entry.kind}
                data-read={entry.read}
                onClick={() => store.markRead(entry.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  gap: 9,
                  padding: "8px 9px",
                  borderRadius: 9,
                  border: "1px solid transparent",
                  background: entry.read ? "transparent" : "rgba(56,189,248,0.08)",
                  color: "#e2e8f0",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ marginTop: 5, width: 8, height: 8, flexShrink: 0, borderRadius: 9999, background: kindColor(entry.kind) }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: entry.read ? 500 : 700 }}>{entry.title}</span>
                    <span style={{ fontSize: 10, color: "rgba(148,163,184,0.7)", whiteSpace: "nowrap" }}>{time(entry.at)}</span>
                  </span>
                  {entry.body !== undefined ? (
                    <span style={{ fontSize: 11, color: "rgba(203,213,225,0.75)" }}>{entry.body}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
