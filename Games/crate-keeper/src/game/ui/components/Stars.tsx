type StarsProps = {
  readonly earned: number;
  readonly size?: number;
  readonly gap?: number;
};

function Star({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2.6l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 17.8 6.4 20.1l1.3-6.3L2.9 9.5l6.4-.7z"
        fill={filled ? "#f5b23c" : "#2c2820"}
        stroke={filled ? "#ffd784" : "#453d30"}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Stars({ earned, size = 18, gap = 2 }: StarsProps) {
  return (
    <span style={{ display: "inline-flex", gap }} aria-label={`${earned} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} filled={i < earned} size={size} />
      ))}
    </span>
  );
}
