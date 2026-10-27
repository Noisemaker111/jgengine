/** The item at `index`; throws when that slot is empty, so a fixed table read never needs a `!`. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at index ${index} of ${items.length}`);
  return item;
}
