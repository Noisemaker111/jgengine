export function AnnouncerTicker({ line, announcerId }: { line: string; announcerId: number }) {
  if (line.length === 0) return null;
  return (
    <div key={announcerId} className="animate-[fadeSlide_3.6s_ease-out_forwards]">
      <span className="rounded-full border border-[#ff6b35]/40 bg-[#160f0c]/85 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[#ffd7ba] shadow-lg shadow-black/40 sm:text-sm">
        {line}
      </span>
    </div>
  );
}
