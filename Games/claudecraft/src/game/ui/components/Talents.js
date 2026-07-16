import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useGame, usePlayer } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { specsForClass } from "../../talents/catalog";
import { classStore, talentsStore } from "../../session/stores";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE } from "../theme";
function pretty(nodeId) {
    const tail = nodeId.split("/").pop() ?? nodeId;
    return tail.replaceAll(/^[a-z]+_/g, "").replaceAll("_", " ");
}
export function TalentPanel() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    const classId = useKeyedStore(classStore, userId);
    const view = useKeyedStore(talentsStore, userId);
    if (classId === null)
        return null;
    const specs = specsForClass(classId);
    const close = () => commands.run("openTalents", {});
    if (view === null) {
        return (_jsxs("div", { className: `${PANEL} pointer-events-auto w-[440px]`, children: [_jsxs("div", { className: PANEL_TITLE, children: [_jsx("span", { children: "Choose a specialization" }), _jsx("button", { type: "button", className: CLOSE_BUTTON, onClick: close, children: "\u2715" })] }), _jsxs("div", { className: "space-y-2 px-4 py-3", children: [_jsx("p", { className: "text-xs text-stone-400", children: "Permanent for this hero. Talent points arrive every level from 10." }), specs.map((spec) => (_jsxs("button", { type: "button", onClick: () => commands.run("talent.choose", { specId: spec.id }), className: "flex w-full items-center gap-3 rounded border border-stone-700 bg-stone-900/80 px-3 py-2.5 text-left hover:border-amber-500", children: [_jsx("span", { className: "flex h-10 w-10 items-center justify-center rounded border border-stone-600 text-amber-300", children: _jsx(GameIcon, { name: spec.icon, size: 24 }) }), _jsxs("span", { children: [_jsx("span", { className: "block font-semibold text-amber-100", children: spec.name }), _jsxs("span", { className: "block text-[11px] text-stone-500", children: [spec.nodes.length, " talents"] })] })] }, spec.id)))] })] }));
    }
    const spec = specs.find((entry) => entry.id === view.specId);
    if (spec === undefined)
        return null;
    return (_jsxs("div", { className: `${PANEL} pointer-events-auto w-[440px] max-h-[72vh] overflow-hidden`, children: [_jsxs("div", { className: PANEL_TITLE, children: [_jsxs("span", { children: [spec.name, " \u00B7 ", _jsxs("span", { className: "text-amber-400", children: [view.pointsAvailable, " points"] })] }), _jsx("button", { type: "button", className: CLOSE_BUTTON, onClick: close, children: "\u2715" })] }), _jsx("div", { className: "max-h-[58vh] space-y-1 overflow-y-auto px-4 py-3", children: spec.nodes.map((node) => {
                    const rank = view.ranks[node.id] ?? 0;
                    const maxed = rank >= node.maxRank;
                    const gated = node.requiresPointsInBranch !== undefined && view.pointsSpent < node.requiresPointsInBranch;
                    return (_jsxs("button", { type: "button", disabled: maxed || gated || view.pointsAvailable <= 0, onClick: () => commands.run("talent.allocate", { nodeId: node.id }), className: `flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm ${maxed
                            ? "border-amber-700 bg-amber-950/50 text-amber-200"
                            : gated
                                ? "border-stone-800 text-stone-600"
                                : "border-stone-700 bg-stone-900/70 text-stone-200 hover:border-amber-500"}`, children: [_jsxs("span", { className: "capitalize", children: [pretty(node.id), gated && node.requiresPointsInBranch !== undefined && (_jsxs("span", { className: "ml-2 text-[10px] text-stone-500", children: ["needs ", node.requiresPointsInBranch, " pts spent"] }))] }), _jsxs("span", { className: `font-bold ${maxed ? "text-amber-300" : "text-stone-400"}`, children: [rank, "/", node.maxRank] })] }, node.id));
                }) })] }));
}
