export type Sprite = readonly string[];

export const SQUID: readonly [Sprite, Sprite] = [
  [
    "00011000",
    "00111100",
    "01111110",
    "11011011",
    "11111111",
    "00100100",
    "01011010",
    "10100101",
  ],
  [
    "00011000",
    "00111100",
    "01111110",
    "11011011",
    "11111111",
    "01011010",
    "10000001",
    "01000010",
  ],
];

export const CRAB: readonly [Sprite, Sprite] = [
  [
    "00100000100",
    "00010001000",
    "00111111100",
    "01101110110",
    "11111111111",
    "10111111101",
    "10100000101",
    "00011011000",
  ],
  [
    "00100000100",
    "10010001001",
    "10111111101",
    "11101110111",
    "11111111111",
    "01111111110",
    "00100000100",
    "01000000010",
  ],
];

export const OCTOPUS: readonly [Sprite, Sprite] = [
  [
    "000011110000",
    "011111111110",
    "111111111111",
    "111001100111",
    "111111111111",
    "000110011000",
    "011001100110",
    "110000000011",
  ],
  [
    "000011110000",
    "011111111110",
    "111111111111",
    "111001100111",
    "111111111111",
    "001101100110",
    "011000000110",
    "001100001100",
  ],
];

export const CANNON: Sprite = [
  "0000001000000",
  "0000011100000",
  "0000011100000",
  "0111111111110",
  "1111111111111",
  "1111111111111",
  "1111111111111",
  "1111111111111",
];

export const SAUCER: Sprite = [
  "0000011111100000",
  "0001111111111000",
  "0011111111111100",
  "0110110110110110",
  "1111111111111111",
  "0011100110011100",
  "0001000000001000",
];

export const EXPLOSION: Sprite = [
  "00100010010",
  "10010100100",
  "01000100010",
  "00110111000",
  "11100000111",
  "00110111000",
  "01000100010",
  "10010100100",
];

export const TIER_SPRITES: readonly (readonly [Sprite, Sprite])[] = [SQUID, CRAB, CRAB, OCTOPUS, OCTOPUS];

export function spriteWidth(sprite: Sprite): number {
  return sprite[0]!.length;
}

export function spriteHeight(sprite: Sprite): number {
  return sprite.length;
}

export function drawSprite(
  c: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  px: number,
  color: string,
): void {
  c.fillStyle = color;
  for (let r = 0; r < sprite.length; r += 1) {
    const row = sprite[r]!;
    for (let col = 0; col < row.length; col += 1) {
      if (row[col] === "1") c.fillRect(x + col * px, y + r * px, px, px);
    }
  }
}
