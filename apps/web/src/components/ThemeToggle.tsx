import { currentTheme, setTheme } from "../lib/theme";

export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={() => setTheme(currentTheme() === "dark" ? "light" : "dark")}
      aria-label="Toggle light and dark theme"
      title="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-fg"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 dark:hidden" aria-hidden>
        <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" strokeLinejoin="round" />
      </svg>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="hidden h-4 w-4 dark:block" aria-hidden>
        <circle cx="8" cy="8" r="3" />
        <path
          d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
