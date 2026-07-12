export default function Preview() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#3fa9e8] via-[#ffd9a0] to-[#e8c37a] font-sans">
      <div className="absolute left-6 top-6 flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="text-2xl text-[#ffb020] drop-shadow-[2px_2px_0_#000]">
            ★
          </span>
        ))}
        {[3, 4].map((i) => (
          <span key={i} className="text-2xl text-black/30">
            ★
          </span>
        ))}
      </div>
      <div className="flex flex-col items-center">
        <div className="-skew-x-6 border-4 border-black bg-[#f2599b] px-6 py-2 text-4xl font-black uppercase tracking-tight text-white shadow-[8px_8px_0_#000]">
          Vice Isle
        </div>
        <div className="mt-2 -skew-x-6 border-2 border-black bg-[#ffb020] px-3 py-1 text-xs font-black uppercase text-black shadow-[4px_4px_0_#000]">
          Steal it. Drive it. Shake the heat.
        </div>
      </div>
      <div className="absolute bottom-5 left-8 h-10 w-24 -skew-x-6 border-2 border-black bg-[#d64545] shadow-[4px_4px_0_#000]" />
      <div className="absolute bottom-4 left-10 flex gap-10">
        <div className="h-6 w-6 rounded-full border-2 border-black bg-[#181a1f]" />
        <div className="h-6 w-6 rounded-full border-2 border-black bg-[#181a1f]" />
      </div>
      <div className="absolute bottom-6 right-8 flex flex-col gap-1">
        {["#f4a7c3", "#33c1b1", "#ffb020"].map((c, i) => (
          <div key={i} className="h-8 border-2 border-black shadow-[3px_3px_0_#000]" style={{ background: c, width: 90 - i * 18 }} />
        ))}
      </div>
    </div>
  );
}
