/**
 * The Highland Vale as a surveyor inked it: contour rings round the two heights, the river, the
 * war-road from the Vanguard keep to the Warcamp in red, little tree marks and a compass rose. Pure
 * line art in the parchment's own ink, drawn behind the title sheet's words at low strength.
 */
export function MapArt({ className }: { className?: string }) {
  const trees: [number, number][] = [
    [70, 520], [92, 548], [58, 572], [120, 590], [84, 610], [400, 140], [428, 168], [452, 132], [470, 176], [380, 182],
    [500, 600], [528, 630], [476, 648], [540, 560], [212, 700], [240, 726], [186, 742],
  ];
  return (
    <svg className={`ec-map-art ${className ?? ""}`} viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {/* Contours: the northern height, where the Warcamp sits. */}
        <path strokeWidth="1.4" d="M330 70 C420 40 540 80 560 150 C580 230 500 290 420 280 C340 270 280 220 290 160 C296 120 300 84 330 70 Z" />
        <path strokeWidth="1.2" d="M350 100 C420 80 510 110 522 160 C534 212 476 250 420 244 C364 238 326 206 330 166 C333 134 330 110 350 100 Z" />
        <path strokeWidth="1" d="M378 130 C426 118 482 138 486 168 C490 198 452 216 420 212 C388 208 364 190 366 168 C368 150 364 136 378 130 Z" />
        <path strokeWidth="0.9" d="M404 156 C428 150 452 160 452 172 C452 186 434 192 420 190 C404 188 394 180 396 170 C397 162 396 158 404 156 Z" />
        {/* Contours: the southern rise under the Vanguard keep. */}
        <path strokeWidth="1.3" d="M60 600 C40 520 110 470 190 480 C270 490 300 560 280 620 C260 690 180 720 120 700 C80 686 70 640 60 600 Z" />
        <path strokeWidth="1.1" d="M96 598 C86 546 132 514 186 520 C240 526 258 568 246 606 C234 648 182 668 142 656 C112 646 102 624 96 598 Z" />
        <path strokeWidth="0.9" d="M132 594 C128 566 152 550 180 554 C208 558 218 578 212 598 C206 620 180 630 160 624 C142 618 135 608 132 594 Z" />
        {/* The river, in a lighter wash of the same ink. */}
        <path strokeWidth="3.2" strokeOpacity="0.55" d="M0 330 C80 300 140 360 220 350 C300 340 330 290 410 300 C480 309 520 360 600 340" />
        <path strokeWidth="1" strokeOpacity="0.55" d="M0 342 C80 314 140 372 220 362 C300 352 330 302 410 312 C480 321 520 372 600 352" />
      </g>
      {/* The war-road, ruled in red ink, with the crossing marked. */}
      <path className="ec-map-road" fill="none" strokeWidth="2.6" strokeDasharray="9 7" strokeLinecap="round" d="M172 590 C210 520 236 470 250 400 C262 345 300 300 350 260 C380 236 404 206 420 172" />
      <g className="ec-map-marks" fill="none" strokeWidth="3" strokeLinecap="round">
        <path d="M410 162 L430 182 M430 162 L410 182" />
      </g>
      <g fill="currentColor">
        {trees.map(([x, y]) => (
          <path key={`${x}-${y}`} d={`M${x} ${y - 9} L${x + 6} ${y + 3} L${x + 1.5} ${y + 3} L${x + 1.5} ${y + 7} L${x - 1.5} ${y + 7} L${x - 1.5} ${y + 3} L${x - 6} ${y + 3} Z`} fillOpacity="0.8" />
        ))}
        {/* The Vanguard keep: a little bastion glyph. */}
        <path d="M160 594 h24 v-14 h-4 v4 h-4 v-4 h-4 v4 h-4 v-4 h-4 v4 h-4 v-4 h-4 z" />
      </g>
      {/* Compass rose. */}
      <g transform="translate(510 720)" fill="currentColor" stroke="currentColor">
        <circle r="30" fill="none" strokeWidth="1" />
        <circle r="24" fill="none" strokeWidth="0.6" />
        <path d="M0 -38 L6 0 L0 38 L-6 0 Z" strokeWidth="0.6" fillOpacity="0.7" />
        <path d="M-38 0 L0 -5 L38 0 L0 5 Z" strokeWidth="0.6" fillOpacity="0.4" />
        <text y="-44" textAnchor="middle" fontSize="16" stroke="none" fontFamily="var(--ec-font-display)">N</text>
      </g>
    </svg>
  );
}
