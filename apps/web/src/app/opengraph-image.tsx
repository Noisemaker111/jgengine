import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "JGengine — the TypeScript game engine for AI coding agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#080b10",
          color: "white",
          fontFamily: "Arial, sans-serif",
          padding: "72px 78px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "radial-gradient(circle at 18% 20%, rgba(64,124,255,.34), transparent 34%), radial-gradient(circle at 86% 78%, rgba(93,221,255,.18), transparent 32%), linear-gradient(120deg, transparent 35%, rgba(255,255,255,.035) 35%, rgba(255,255,255,.035) 36%, transparent 36%)",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div
              style={{
                width: 96,
                height: 96,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "5px solid white",
                borderRadius: 20,
                transform: "rotate(30deg)",
                boxShadow: "0 0 40px rgba(64,124,255,.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  transform: "rotate(-30deg)",
                  fontSize: 42,
                  fontWeight: 900,
                  letterSpacing: -5,
                }}
              >
                JG
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 4 }}>
                JGENGINE
              </div>
              <div style={{ fontSize: 20, color: "#9cb6e8", marginTop: 6 }}>
                jgengine.com
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
            <div
              style={{
                fontSize: 68,
                lineHeight: 1.02,
                fontWeight: 900,
                letterSpacing: -3,
              }}
            >
              Build games with one prompt.
            </div>
            <div
              style={{
                fontSize: 29,
                lineHeight: 1.35,
                color: "#c5d2e8",
                marginTop: 24,
              }}
            >
              A pure-TypeScript game engine designed for AI coding agents.
            </div>
          </div>

          <div style={{ display: "flex", gap: 18, fontSize: 20, color: "#8fa6ca" }}>
            <span>TypeScript</span><span>•</span><span>Agent-first</span><span>•</span><span>Browser games</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
