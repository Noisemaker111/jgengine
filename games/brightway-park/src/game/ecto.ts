/**
 * Ectoplasm is the haunt's one currency: every scare wrings some out of the living, ghosts in
 * residence seep it nightly, and everything the haunt builds is paid for in it. This is how an
 * amount reads anywhere a player sees one.
 */
export const ECTO = "ecto";

/** "1,200 ecto", "−40 ecto". */
export function ecto(amount: number): string {
  return `${amount < 0 ? "−" : ""}${Math.abs(Math.round(amount)).toLocaleString()} ${ECTO}`;
}
