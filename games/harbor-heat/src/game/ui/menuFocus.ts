export const harborFocus: { id: string | null } = { id: null };

export function focusHarborVerb(id: string | null): void {
  harborFocus.id = id;
}
