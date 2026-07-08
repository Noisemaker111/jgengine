const gamePackages = import.meta.glob<{ name: string }>("../../../../Games/*/package.json", {
  eager: true,
  import: "default",
});

export type Game = {
  id: string;
  title: string;
  href: string;
};

const titleCase = (id: string) =>
  id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const GAMES: Game[] = Object.keys(gamePackages)
  .map((path) => {
    const id = path.split("/").at(-2) ?? path;
    return { id, title: titleCase(id), href: `/play/?game=${id}` };
  })
  .sort((a, b) => a.title.localeCompare(b.title));
