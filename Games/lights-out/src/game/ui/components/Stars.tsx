import { starStyle } from "../theme";

export function Stars({ value, total = 3, size = 1 }: { value: number; total?: number; size?: number }) {
  const stars = [];
  for (let i = 0; i < total; i += 1) {
    const filled = i < value;
    stars.push(
      <span key={i} style={starStyle(filled, size)}>
        {filled ? "★" : "☆"}
      </span>,
    );
  }
  return <span style={{ display: "inline-flex", gap: `${size * 0.12}rem` }}>{stars}</span>;
}
