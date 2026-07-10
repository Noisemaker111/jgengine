export type Polarity = "red" | "blue";

export type MagneticContact = "hold" | "repel";

export function opposite(polarity: Polarity): Polarity {
  return polarity === "red" ? "blue" : "red";
}

export function resolveContact(botPolarity: Polarity, surfacePolarity: Polarity): MagneticContact {
  return botPolarity === surfacePolarity ? "repel" : "hold";
}

export function holds(botPolarity: Polarity, surfacePolarity: Polarity): boolean {
  return resolveContact(botPolarity, surfacePolarity) === "hold";
}
