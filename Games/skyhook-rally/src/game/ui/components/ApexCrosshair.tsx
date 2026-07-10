export function ApexCrosshair({ attached, apexOpen }: { attached: boolean; apexOpen: boolean }) {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <div
        className="absolute inset-0 rounded-full border-2 transition-all duration-150"
        style={
          apexOpen
            ? { borderColor: "#ffd699", boxShadow: "0 0 18px 4px rgba(255,214,153,0.75)", transform: "scale(1.15)" }
            : attached
              ? { borderColor: "rgba(244,239,230,0.55)", boxShadow: "none", transform: "scale(1)" }
              : { borderColor: "rgba(244,239,230,0.2)", boxShadow: "none", transform: "scale(0.9)" }
        }
      />
      <div className="h-1.5 w-1.5 rounded-full bg-[#f4efe6]" />
      {attached ? (
        <span className="absolute -bottom-5 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-[#f4efe6]/80">
          {apexOpen ? "Release! Apex bell" : "Swinging"}
        </span>
      ) : null}
    </div>
  );
}
