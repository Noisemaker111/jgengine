import { useEffect } from "react";
import { useGame } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSettings } from "@jgengine/react/settings";
import { useStore } from "@jgengine/react/store";
import { awayStore } from "../../away";
import { startedStore } from "../../commands";
import { courierStore, DELIVERY_ROUTES, RUSH_BOND, type CourierState } from "../../jobs/courier";
import { saveHarborState } from "../../save";
import { sessionStore } from "../../session";
import { ReceiptScreen, type Slip } from "../fiction/Receipt";

/** What the slip says: a delivery's receipt, paid or missed, or the paper's front page for a bust or a clinic stay. */
export function resultOf(notice: string, courier: CourierState): Slip {
  const title = { id: "title", label: "Title" };
  if (notice !== "courier") {
    const [head, body] = notice.split(" · ");
    const busted = head?.startsWith("Busted") === true;
    return {
      kind: "tabloid",
      tone: "warn",
      stamp: busted ? "HHPD blotter" : "Mainsail General",
      title: busted ? "Courier busted on the boulevard" : "Courier walks out of Mainsail General",
      summary: body ?? notice,
      actions: [{ id: "roam", label: "Back to it", primary: true }, title],
    };
  }
  const route = DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!;
  const rush = courier.service === "rush";
  const roam = { id: "roam", label: "Free roam" };
  const service = { label: "Service", value: rush ? "Rush" : "Standard" };
  if (courier.receipt?.won === true) {
    const condition = rush ? [{ label: "Cargo condition", value: `${Math.round(courier.condition ?? 100)}%` }] : [];
    return { kind: "receipt", tone: "good", stamp: "Paid", title: "Signed. Sealed. Paid.", summary: `${route.recipient} has the parcel.`, lines: [{ label: "Deliver to", value: route.recipient }, service, ...condition, { label: "Paid", value: `+$${courier.receipt.reward}` }, { label: "Street cred", value: "+15" }], actions: [{ id: "next", label: "Next parcel", primary: true }, roam, title] };
  }
  const reason = courier.receipt?.reason ?? null;
  const late = reason === null || /deadline|expired/i.test(reason);
  return {
    kind: "receipt",
    tone: "bad",
    stamp: late ? "Late" : "Lost",
    title: late ? "Missed the tide." : "Parcel lost.",
    summary: late ? (rush ? `Too slow: the $${RUSH_BOND} bond is gone. The parcel went back to dispatch.` : "Too slow: the parcel went back to dispatch. No cash lost.") : reason,
    lines: [{ label: "Deliver to", value: route.recipient }, service, { label: "Paid", value: rush ? `-$${RUSH_BOND}` : "$0" }],
    actions: [{ id: "retry", label: "Try again", primary: true }, roam, title],
  };
}

/** Pause on P (also over a receipt), and the end-of-run receipt with its choices. */
export function SessionUI() {
  const { commands } = useGame();
  const ctx = useGameContext();
  const settings = useSettings();
  const session = useStore(sessionStore, (value) => value);
  const started = useStore(startedStore, (value) => value === true);
  const courier = useStore(courierStore, (value) => value);
  const away = useStore(awayStore, (value) => value ?? null);
  useEffect(() => {
    // A restored snapshot can reset transient stores while the settings provider stays open.
    if (session.settings !== settings.isOpen) commands.run("session.settings", { open: settings.isOpen });
  }, [commands, settings.isOpen, session.settings]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.code !== "KeyP" || event.repeat || !started || settings.isOpen) return;
      if ((event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      commands.run("session.pause", { paused: !session.paused });
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [commands, started, session.paused, settings.isOpen]);
  if (!started || session.paused || settings.isOpen) return null;
  if (session.notice === "" && away !== null) {
    // The morning paper after a night's sleep or a Continue: what the city did without you.
    return (
      <ReceiptScreen
        key={away.title}
        slip={{ kind: "tabloid", tone: "warn", stamp: away.kind === "sleep" ? "Morning edition" : "While you were out", title: away.title, summary: away.summary, lines: away.lines, actions: [{ id: "roam", label: "Back to it", primary: true }] }}
        onAction={() => commands.run("away.dismiss", {})}
      />
    );
  }
  if (session.notice === "") return null;
  const dismiss = session.notice === "courier" ? "courier.dismiss" : "session.dismiss";
  return (
    <ReceiptScreen
      key={session.notice}
      slip={resultOf(session.notice, courier)}
      onAction={(id) => {
        if (id === "retry" || id === "next") return commands.run("courier.retry", { service: id === "retry" ? courier.service : undefined });
        commands.run(dismiss, {});
        // Title keeps the run where it stands, so Continue picks up here and not at an older autosave.
        if (id === "title") void saveHarborState(ctx).then(() => commands.run("session.title", {}));
      }}
    />
  );
}
