export const GAME_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const FOLDER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;

/** @internal */
export function displayNameFromId(id: string): string {
  return id
    .split("-")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** @internal */
export function displayNameFromInput(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) {
    throw new Error("game name must not be empty");
  }
  if (/\s/.test(trimmed)) return trimmed;
  if (trimmed.includes("-")) return displayNameFromId(trimmed.toLowerCase());
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** @internal */
export function folderNameFromTitle(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ");
  if (cleaned.length === 0) {
    throw new Error("game name must not be empty");
  }
  const folder = cleaned
    .split(" ")
    .filter((part) => part.length > 0)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!FOLDER_NAME_PATTERN.test(folder)) {
    throw new Error(
      `folder name "${folder}" must start with a letter and contain only letters, digits, and dashes`,
    );
  }
  return folder;
}

/** @internal */
export function packageIdFromFolder(folder: string): string {
  const id = folder
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!GAME_ID_PATTERN.test(id)) {
    throw new Error(
      `package id "${id}" must be kebab-case: lowercase letters, digits, dashes, starting with a letter`,
    );
  }
  return id;
}

/** @internal */
export function parseCreateName(input: string): { displayName: string; folderName: string; id: string } {
  const displayName = displayNameFromInput(input);
  const folderName = folderNameFromTitle(input);
  const id = packageIdFromFolder(folderName);
  return { displayName, folderName, id };
}
