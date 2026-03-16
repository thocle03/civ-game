export type Hex = { q: number; r: number; s: number };
export type Point = { x: number; y: number };

export const Layout = {
  size: { x: 40, y: 40 },
  origin: { x: 0, y: 0 }
};

export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r, s: a.s + b.s });
export const hexSubtract = (a: Hex, b: Hex): Hex => ({ q: a.q - b.q, r: a.r - b.r, s: a.s - b.s });
export const hexMultiply = (a: Hex, k: number): Hex => ({ q: a.q * k, r: a.r * k, s: a.s * k });
export const hexLength = (hex: Hex): number => (Math.abs(hex.q) + Math.abs(hex.r) + Math.abs(hex.s)) / 2;
export const hexDistance = (a: Hex, b: Hex): number => hexLength(hexSubtract(a, b));

const hexDirections: Hex[] = [
  { q: 1, r: -1, s: 0 }, { q: 1, r: 0, s: -1 }, { q: 0, r: 1, s: -1 },
  { q: -1, r: 1, s: 0 }, { q: -1, r: 0, s: 1 }, { q: 0, r: -1, s: 1 }
];
export const hexDirection = (direction: number): Hex => hexDirections[direction];
export const hexNeighbor = (hex: Hex, direction: number): Hex => hexAdd(hex, hexDirection(direction));

export const hexToPixel = (hex: Hex): Point => {
  const x = Layout.size.x * (Math.sqrt(3) * hex.q + Math.sqrt(3) / 2 * hex.r) + Layout.origin.x;
  const y = Layout.size.y * (3 / 2 * hex.r) + Layout.origin.y;
  return { x, y };
};

export const hexRound = (frac: { q: number; r: number; s: number }): Hex => {
  let q = Math.round(frac.q);
  let r = Math.round(frac.r);
  let s = Math.round(frac.s);
  const q_diff = Math.abs(q - frac.q);
  const r_diff = Math.abs(r - frac.r);
  const s_diff = Math.abs(s - frac.s);
  if (q_diff > r_diff && q_diff > s_diff) q = -r - s;
  else if (r_diff > s_diff) r = -q - s;
  else s = -q - r;
  return { q, r, s };
};

export const pixelToHex = (p: Point): Hex => {
  const pt = { x: p.x - Layout.origin.x, y: p.y - Layout.origin.y };
  const q = (Math.sqrt(3) / 3 * pt.x - 1 / 3 * pt.y) / Layout.size.x;
  const r = (2 / 3 * pt.y) / Layout.size.y;
  return hexRound({ q, r, s: -q - r });
};
