import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GameIcon } from "@jgengine/react/gameIcons";
import { SettingsTrigger, StartScreen } from "@jgengine/react";
import { useGame, usePlayer } from "@jgengine/react/hooks";
import { useCallback, useState } from "react";
import { CLASSES } from "../../classes/catalog";
import { classSelectReady, isHeroNameValid, pickSuggestedName, selectClass, } from "./classSelectState";
export function ClassSelect() {
    const { commands } = useGame();
    const { userId } = usePlayer();
    void userId;
    const [selected, setSelected] = useState(null);
    const [name, setName] = useState(pickSuggestedName);
    const handleSelect = useCallback((event) => {
        const classId = event.currentTarget.dataset.classId;
        if (classId !== undefined)
            setSelected((current) => selectClass(current, classId));
    }, []);
    const ready = classSelectReady(selected, name);
    return (_jsx(StartScreen, { className: "pointer-events-auto absolute inset-0 z-40 flex items-center justify-center", style: { background: "radial-gradient(ellipse at center, #15151f 0%, #08080d 80%)" }, settings: _jsx(SettingsTrigger, { className: "pointer-events-auto absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md border border-[#6f5a2a] bg-[#15151f]/90 text-[#c8a838] transition hover:border-[#ffd100]" }), settingsWrapperClassName: "contents", children: _jsxs("div", { className: "max-w-4xl px-6 text-center", children: [_jsx("p", { className: "text-sm uppercase tracking-[0.3em] text-[#c8a838]", style: { fontFamily: "var(--wcc-font-display)" }, children: "World of ClaudeCraft" }), _jsx("h1", { className: "wcc-title mt-1 text-4xl font-bold", children: "Choose Your Class" }), _jsx("p", { className: "mt-2 text-sm text-[#998d6a]", children: "Nine callings, three zones, one road to the Hollow Crypt." }), _jsx("input", { type: "text", value: name, maxLength: 16, placeholder: "Name your hero", onChange: (event) => setName(event.target.value), className: "wcc-panel mx-auto mt-6 block w-72 rounded-md px-4 py-2.5 text-center text-white placeholder:text-[#6b6350] focus:border-[#ffd100] focus:outline-none", style: { fontSize: 16, fontFamily: "var(--wcc-font-display)", letterSpacing: "0.05em" } }), _jsx("div", { className: "mt-6 grid grid-cols-3 gap-3", children: CLASSES.map((cls) => {
                        const sel = selected === cls.id;
                        return (_jsxs("button", { type: "button", "data-class-id": cls.id, onClick: handleSelect, className: "wcc-panel group flex min-h-[92px] items-center gap-3 px-4 py-3 text-left transition", style: sel
                                ? { boxShadow: `0 0 16px ${cls.color}`, borderColor: cls.color }
                                : undefined, children: [_jsx("span", { className: "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 bg-[radial-gradient(circle_at_35%_30%,#2c2c3a,#15151f)]", style: { color: cls.color, borderColor: sel ? cls.color : "#4a3d1d" }, children: _jsx(GameIcon, { name: cls.icon, size: 30 }) }), _jsxs("span", { children: [_jsx("span", { className: "block font-semibold", style: { color: cls.color, fontFamily: "var(--wcc-font-display)" }, children: cls.name }), _jsx("span", { className: "block text-xs capitalize text-[#998d6a]", children: cls.resource }), _jsx("span", { className: "block text-xs text-stone-500", children: cls.abilities.slice(0, 2).map((ability) => ability.name).join(" · ") })] })] }, cls.id));
                    }) }), _jsx("button", { type: "button", disabled: !ready, onClick: () => {
                        if (selected !== null && isHeroNameValid(name)) {
                            commands.run("class.select", { classId: selected, name: name.trim() });
                        }
                    }, className: "mt-8 rounded-lg px-14 py-3 text-2xl font-bold uppercase tracking-[3px] transition disabled:cursor-not-allowed disabled:opacity-40", style: {
                        fontFamily: "var(--wcc-font-display)",
                        background: "linear-gradient(180deg, #f8da78 0%, #e2b03a 44%, #b7820f 100%)",
                        color: "#2a1c05",
                        border: "1px solid #ffe6a0",
                        boxShadow: "0 2px 8px #000a, 0 0 26px rgba(255,209,0,0.28)",
                    }, children: "Play" })] }) }));
}
