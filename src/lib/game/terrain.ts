export type Terrain = "sand" | "dune" | "scrub" | "wadi" | "oasis";

export function cellHash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function terrainAt(x: number, y: number): Terrain {
  const n = cellHash(x, y);
  if (n % 41 === 0) return "oasis";
  if (n % 13 === 0) return "wadi";
  if (n % 5 === 0) return "scrub";
  if (n % 3 === 0) return "dune";
  return "sand";
}

export const TERRAIN_LABEL: Record<Terrain, string> = {
  sand: "رمل",
  dune: "كثيب",
  scrub: "عشب شحيح",
  wadi: "مجرى جاف",
  oasis: "واحة",
};
