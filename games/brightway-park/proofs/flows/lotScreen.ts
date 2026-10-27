/** The CSS pixel a ground point of the lot shows at, read from the overlay's dev projector (`__brightwayScreen`). */
export async function lotScreen(f: { page(expression: string): Promise<unknown> }, x: number, z: number): Promise<{ x: number; y: number }> {
  const point: unknown = await f.page(`__brightwayScreen(${x}, ${z})`);
  if (typeof point === "object" && point !== null && "x" in point && "y" in point && typeof point.x === "number" && typeof point.y === "number") {
    return { x: point.x, y: point.y };
  }
  throw new Error(`lot point (${x}, ${z}) is not on screen`);
}
