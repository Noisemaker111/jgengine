import { ControlsList, SettingsTrigger, StartScreen as MenuScreen } from "@jgengine/react";
import { HudLabel } from "@/components/ui/hud-label";
import { HudPanel } from "@/components/ui/hud-panel";
import { KeybindBadge } from "@/components/ui/keybind-badge";
import { MenuButton } from "@/components/ui/menu-button";

import { keybinds } from "../../keybinds";
import { COURSES, COURSE_ORDER, type CourseId } from "../../race/courses";
import { requestCourse, requestStart } from "../../drone/menuIntent";

export function StartScreen({ courseId }: { courseId: CourseId }) {
  return (
    <MenuScreen
      className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-8 overflow-y-auto py-8"
      settings={
        <SettingsTrigger className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#3a4048] bg-[#20242b]/90 text-[#9ef01a] transition-colors hover:bg-[#2a2f37]/90" />
      }
      settingsWrapperClassName="absolute top-5 right-5"
    >
      <div className="flex flex-col items-center gap-2">
        <h1
          className="m-0 text-[clamp(30px,5vw,46px)] font-extrabold uppercase tracking-[0.22em]"
          style={{
            fontFamily: "var(--jg-font-display)",
            color: "var(--jg-text)",
            textShadow: "0 4px 0 var(--jg-accent-deep), 0 8px 22px rgba(0,0,0,0.9), 0 0 32px var(--jg-accent-glow)",
          }}
        >
          Drone Derby
        </h1>
        <span className="text-[12px] uppercase tracking-[0.32em]" style={{ color: "var(--jg-mana)" }}>
          Volt-Neon Tech Expo — Container Port Circuit
        </span>
      </div>

      <HudPanel title="Select Course" width={420}>
        <div className="flex flex-col gap-2.5">
          {COURSE_ORDER.map((id, index) => {
            const course = COURSES[id];
            const selected = id === courseId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => requestCourse(id)}
                className="flex items-center justify-between gap-3 border-none px-3 py-2 text-left"
                style={{
                  background: selected ? "rgba(158,240,26,0.12)" : "transparent",
                  border: `1px solid ${selected ? "var(--jg-accent)" : "var(--jg-edge)"}`,
                  cursor: "pointer",
                }}
              >
                <span className="flex items-center gap-2.5">
                  <KeybindBadge label={String(index + 1)} size="sm" />
                  <span className="flex flex-col">
                    <span
                      className="text-[13px] font-bold uppercase tracking-[0.16em]"
                      style={{ color: selected ? "var(--jg-text)" : "var(--jg-text-dim)" }}
                    >
                      {course.name}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "var(--jg-text-dim)" }}>
                      {course.ringIds.length} rings · cap {Math.floor(course.clockCapSec / 60)}:
                      {String(course.clockCapSec % 60).padStart(2, "0")}
                    </span>
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5 font-mono text-[10px]">
                  <span style={{ color: "var(--jg-accent)" }}>GOLD {course.parGold}s</span>
                  <span style={{ color: "var(--jg-mana)" }}>SILVER {course.parSilver}s</span>
                  <span style={{ color: "var(--jg-stamina)" }}>BRONZE {course.parBronze}s</span>
                </span>
              </button>
            );
          })}
        </div>
      </HudPanel>

      <MenuButton label="Launch" keybind="Enter" onActivate={() => requestStart()} width={220} />

      <HudPanel title="Controls" width={420}>
        <ControlsList
          bindings={keybinds}
          controls={[
            { action: ["throttleUp", "throttleDown"], label: "Throttle up / down" },
            { action: ["yawLeft", "yawRight"], label: "Yaw left / right" },
            { action: ["pitchForward", "pitchBack"], label: "Pitch forward / back" },
            { action: ["strafeLeft", "strafeRight"], label: "Strafe left / right" },
            { action: "boost", label: "Boost" },
            { action: "chargeToggle", label: "Land / charge toggle" },
            { action: "restart", label: "Restart" },
          ]}
          className="grid grid-cols-2 gap-x-6 gap-y-2"
          rowClassName="flex items-center gap-2.5"
          labelClassName="text-[11px] [color:var(--jg-text-dim)]"
          renderKey={(key) => <KeybindBadge label={key} size="sm" />}
        />
        <div className="mt-2">
          <HudLabel>Mouse-drag also steers pitch / strafe</HudLabel>
        </div>
      </HudPanel>
    </MenuScreen>
  );
}
