export type AreaConfig = {
  id: string;
  name: string;
  shortName: string;
  priority: number;
  searchPath: string;
  bounds: { north: number; south: number; east: number; west: number };
};

export const AREAS: AreaConfig[] = [
  {
    id: "little-italy",
    name: "Little Italy",
    shortName: "Little Italy",
    priority: 0,
    searchPath: "/california/san-diego-apartments/little-italy-neighborhood",
    bounds: { north: 32.735, south: 32.708, east: -117.145, west: -117.19 },
  },
  {
    id: "carlsbad-village",
    name: "Carlsbad Village",
    shortName: "Carlsbad",
    priority: 1,
    searchPath: "/california/carlsbad-apartments/carlsbad-village-neighborhood",
    bounds: { north: 33.17, south: 33.139, east: -117.31, west: -117.37 },
  },
  {
    id: "encinitas",
    name: "Encinitas",
    shortName: "Encinitas",
    priority: 2,
    searchPath: "/california/encinitas-apartments",
    bounds: { north: 33.09, south: 33.035, east: -117.25, west: -117.32 },
  },
  {
    id: "leucadia",
    name: "Leucadia",
    shortName: "Leucadia",
    priority: 3,
    searchPath: "/california/encinitas-apartments/leucadia-neighborhood",
    bounds: { north: 33.09, south: 33.065, east: -117.25, west: -117.32 },
  },
  {
    id: "cardiff",
    name: "Cardiff-by-the-Sea",
    shortName: "Cardiff",
    priority: 4,
    searchPath: "/california/cardiff-by-the-sea-apartments",
    bounds: { north: 33.025, south: 32.995, east: -117.25, west: -117.305 },
  },
  {
    id: "solana-beach",
    name: "Solana Beach",
    shortName: "Solana Beach",
    priority: 5,
    searchPath: "/california/solana-beach-apartments",
    bounds: { north: 33.02, south: 32.985, east: -117.23, west: -117.28 },
  },
  {
    id: "del-mar",
    name: "Del Mar",
    shortName: "Del Mar",
    priority: 6,
    searchPath: "/california/del-mar-apartments",
    bounds: { north: 32.99, south: 32.95, east: -117.23, west: -117.28 },
  },
  {
    id: "oceanside",
    name: "Oceanside",
    shortName: "Oceanside",
    priority: 7,
    searchPath: "/california/oceanside-apartments",
    bounds: { north: 33.23, south: 33.18, east: -117.32, west: -117.39 },
  },
];

export const areaForPoint = (lat?: number | null, lng?: number | null): AreaConfig | undefined => {
  if (lat == null || lng == null) return undefined;
  return AREAS.filter(({ bounds }) =>
    lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west
  ).sort((a, b) => {
    const areaSize = (area: AreaConfig) =>
      (area.bounds.north - area.bounds.south) * (area.bounds.east - area.bounds.west);
    return areaSize(a) - areaSize(b) || a.priority - b.priority;
  })[0];
};
