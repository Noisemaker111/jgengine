/** Authored vector portraits of reclaimed machines; silhouettes mirror each build's role. */
export function ReclaimerPortrait({ id, color }: { id: string; color: string }) {
  const heavy = id === "gunk";
  const scout = id === "cipher";
  return <svg viewBox="0 0 240 120" aria-hidden="true" className="signal-portrait">
    <path d="M8 100H232M24 8V108M216 8V108" stroke={color} opacity=".18" fill="none" />
    <circle cx="120" cy="55" r="43" stroke={color} strokeDasharray="4 8" fill="none" opacity=".5" />
    <path d={heavy ? "M47 118L55 83L85 70H155L185 83L193 118Z" : "M65 118L75 87L98 75H142L165 87L175 118Z"} fill="#293940" stroke={color} strokeWidth="2" />
    <path d="M99 83L108 96H132L141 83M87 108H153" fill="none" stroke="#b48a5e" strokeWidth="4" />
    <path d={scout ? "M97 23L129 17L149 44L139 73L110 79L93 59Z" : heavy ? "M86 31L101 17H139L154 31V66L138 80H102L86 66Z" : "M94 29L110 16H134L148 33L140 70L120 81L100 69Z"} fill="#c09b75" stroke="#ebcdaa" strokeWidth="2" />
    <path d={scout ? "M94 43L145 34L147 49L100 59Z" : "M90 39L150 39L145 57H95Z"} fill="#101c22" />
    {scout ? <circle cx="128" cy="45" r="7" fill={color} /> : <path d="M100 45H116V51H100ZM124 45H140V51H124Z" fill={color} />}
    <path d="M108 66H132M117 60V72" stroke="#314047" strokeWidth="3" />
    <path d={heavy ? "M66 95H80M160 95H174M61 104H80M160 104H179" : "M82 97L87 113M158 97L153 113"} stroke={color} strokeWidth="5" />
    {id === "nyx" && <><path d="M83 57L71 26M157 57L169 26" stroke={color} strokeWidth="3" /><circle cx="71" cy="23" r="4" fill={color} /><circle cx="169" cy="23" r="4" fill={color} /></>}
    <text x="12" y="23" fill={color} fontSize="8" fontFamily="monospace">RC / {id.toUpperCase()}</text>
  </svg>;
}
