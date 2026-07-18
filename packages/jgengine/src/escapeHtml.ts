/** Escape the five HTML-significant characters (`&`, `<`, `>`, `"`, `'`) for safe interpolation into
 * generated markup — shared by the scaffold's index.html and the desktop staging index.html.
 * @internal
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
