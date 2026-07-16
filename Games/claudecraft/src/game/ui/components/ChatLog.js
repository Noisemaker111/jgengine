import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChatPanel } from "@jgengine/react/chat";
import { BUTTON } from "../theme";
const CHANNELS = ["global", "party", "proximity"];
const CHANNEL_LABELS = {
    global: "Say",
    party: "Party",
    proximity: "Nearby",
};
export function ChatLog() {
    return (_jsx(ChatPanel, { channels: CHANNELS, className: "wcc-panel flex w-[370px] flex-col overflow-hidden text-xs", tabsClassName: "flex border-b border-[#463a1c]", tabClassName: "flex-1 px-2 py-1 text-[11px] uppercase tracking-wide text-[#998d6a] transition hover:text-[#c9b27a]", activeTabClassName: "wcc-title !text-[#ffd100]", logClassName: "flex h-32 flex-col gap-0.5 overflow-y-auto px-2.5 py-1.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]", messageClassName: "leading-snug", inputClassName: "flex items-center gap-1.5 border-t border-[#463a1c] p-1.5", inputFieldClassName: "flex-1 rounded-[3px] border border-[#463a1c] bg-[#1a1410] px-2 py-1 text-stone-100 focus:border-[#ffd100] focus:outline-none", sendButtonClassName: BUTTON, placeholder: "Say something...", renderTab: (channelId, isActive) => (_jsx("span", { className: isActive ? undefined : "opacity-80", children: CHANNEL_LABELS[channelId] ?? channelId })), renderMessage: (message) => (_jsxs(_Fragment, { children: [_jsxs("span", { className: "font-semibold text-[#9fdc7f]", children: [message.fromUserId, ": "] }), _jsx("span", { className: "text-stone-200", children: message.body })] })) }));
}
