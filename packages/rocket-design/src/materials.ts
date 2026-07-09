/** Curated material densities, kg/m³ (hobby-rocket build materials). */
export type MaterialId = 'balsa' | 'plastic' | 'cardstock' | 'kraft-tube' | 'plywood';

const DENSITY: Record<MaterialId, number> = {
  balsa: 160,
  plastic: 950,
  cardstock: 700,
  'kraft-tube': 850,
  plywood: 630,
};

export const density = (id: MaterialId): number => DENSITY[id];

export const MATERIALS: MaterialId[] = ['balsa', 'plastic', 'cardstock', 'kraft-tube', 'plywood'];
