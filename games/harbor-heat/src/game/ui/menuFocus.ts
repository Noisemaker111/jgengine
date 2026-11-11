/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const harborFocus: { id: string | null } = { id: null };

export function focusHarborVerb(id: string | null): void {
  harborFocus.id = id;
}
