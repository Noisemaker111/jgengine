import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  cabinet: "#2a1c14",
  cabinetLight: "#3d2a1d",
  cabinetDark: "#180f0a",
  field: "#efe2c4",
  fieldShade: "#ddc99f",
  fieldInk: "#3a2a1c",
  cream: "#f6edd6",
  orange: "#e6772b",
  orangeLight: "#ffb15e",
  orangeDark: "#b0501a",
  teal: "#2f9c9c",
  tealLight: "#5fd2cf",
  tealDark: "#1c6b6d",
  red: "#cf3b2c",
  yellow: "#f2c14e",
  brass: "#c99a44",
  brassLight: "#f0cf82",
  brassDark: "#8a6522",
  backglass: "#160d0a",
  backglassLip: "#3a2216",
  segOn: "#ff7a2e",
  lampOn: "#ffd15a",
  lampOff: "#4a3320",
} as const;

function Bumper({ left, top }: { left: string; top: string }) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        top,
        width: "6cqw",
        height: "6cqw",
        borderRadius: "50%",
        transform: "translate(-50%,-50%)",
        background: `radial-gradient(circle at 38% 34%, ${PALETTE.cream}, ${PALETTE.tealLight} 55%, ${PALETTE.tealDark} 100%)`,
        boxShadow: `0 0 2.2cqw rgba(255,157,60,0.55)`,
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontSize: "1cqw",
          fontWeight: 900,
          color: PALETTE.fieldInk,
        }}
      >
        100
      </span>
    </span>
  );
}

function DropTarget({ left, top, on }: { left: string; top: string; on: boolean }) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        top,
        width: "4.4cqw",
        height: "1.4cqw",
        borderRadius: "0.3cqw",
        background: on ? `linear-gradient(${PALETTE.tealLight}, ${PALETTE.tealDark})` : "rgba(28,20,14,0.5)",
        border: on ? `1px solid ${PALETTE.cream}` : "none",
      }}
    />
  );
}

export default function PinballPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `radial-gradient(130% 90% at 50% -10%, ${PALETTE.cabinetLight} 0%, ${PALETTE.cabinet} 42%, ${PALETTE.cabinetDark} 100%)`,
        color: PALETTE.cream,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "14%",
          right: "2.5%",
          width: "20cqw",
          display: "flex",
          flexDirection: "column",
          gap: "1cqw",
          padding: "1cqw 1.2cqw",
          borderRadius: "1cqw",
          background: `linear-gradient(165deg, ${PALETTE.backglassLip}, ${PALETTE.backglass})`,
          border: `1px solid ${PALETTE.brassDark}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "1cqw", fontWeight: 900, letterSpacing: "0.3em", color: PALETTE.orangeLight }}>SOLID · STATE</span>
          <span style={{ fontSize: "0.9cqw", letterSpacing: "0.2em", color: PALETTE.tealLight, opacity: 0.85 }}>★ ★ ★</span>
        </div>
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: "2.2cqw",
            fontWeight: 800,
            letterSpacing: "0.15em",
            padding: "0.6cqw 0.8cqw",
            borderRadius: "0.5cqw",
            background: PALETTE.backglass,
            color: PALETTE.segOn,
            textShadow: `0 0 0.6cqw ${PALETTE.segOn}`,
          }}
        >
          0000000
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5cqw" }}>
            <span style={{ fontSize: "0.9cqw", letterSpacing: "0.2em", color: "rgba(246,237,214,0.6)" }}>BALL</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  height: "0.9cqw",
                  width: "0.9cqw",
                  borderRadius: "50%",
                  background: i === 0 ? PALETTE.lampOn : PALETTE.lampOff,
                  boxShadow: i === 0 ? `0 0 0.5cqw ${PALETTE.lampOn}` : "none",
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: "1.1cqw", fontWeight: 900, color: PALETTE.tealLight }}>1X</span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "24%",
          bottom: "16%",
          transform: "translateX(-50%)",
          width: "38cqw",
          borderRadius: "1.2cqw",
          background: `linear-gradient(158deg, ${PALETTE.orangeLight}, ${PALETTE.orangeDark} 42%, ${PALETTE.cabinetDark})`,
          boxShadow: `inset 0 0 0 0.22cqw ${PALETTE.brass}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "1cqw",
            borderRadius: "0.8cqw",
            overflow: "hidden",
            background: `linear-gradient(${PALETTE.field}, ${PALETTE.fieldShade})`,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: "18%",
              right: "18%",
              top: "8%",
              height: "3.4cqw",
              borderRadius: "0.4cqw",
              background: PALETTE.lampOff,
              display: "flex",
            }}
          >
            {["A", "L", "L"].map((letter, i) => (
              <span
                key={letter + i}
                style={{
                  flex: 1,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "1.4cqw",
                  fontWeight: 900,
                  color: i === 0 ? "#3a1c08" : "rgba(246,237,214,0.4)",
                  background: i === 0 ? PALETTE.lampOn : "transparent",
                }}
              >
                {letter}
              </span>
            ))}
          </span>

          <Bumper left="34%" top="30%" />
          <Bumper left="66%" top="30%" />
          <Bumper left="50%" top="42%" />

          <DropTarget left="24%" top="55%" on />
          <DropTarget left="35%" top="55%" on />
          <DropTarget left="46%" top="55%" on />

          <span
            style={{
              position: "absolute",
              left: "8%",
              bottom: "10%",
              width: "22%",
              height: "1.4cqw",
              transformOrigin: "left center",
              transform: "rotate(-18deg)",
              borderRadius: "0.7cqw",
              background: `linear-gradient(${PALETTE.orangeLight}, ${PALETTE.orange})`,
            }}
          />
          <span
            style={{
              position: "absolute",
              right: "8%",
              bottom: "10%",
              width: "22%",
              height: "1.4cqw",
              transformOrigin: "right center",
              transform: "rotate(18deg)",
              borderRadius: "0.7cqw",
              background: `linear-gradient(${PALETTE.orangeLight}, ${PALETTE.orange})`,
            }}
          />

          <span
            style={{
              position: "absolute",
              right: "5%",
              bottom: "6%",
              width: "1cqw",
              height: "1cqw",
              borderRadius: "50%",
              background: `radial-gradient(circle at 35% 30%, #ffffff, #cfd4dc 55%, #8b909c 100%)`,
            }}
          />
        </div>
      </div>

    </div>
  );
}
