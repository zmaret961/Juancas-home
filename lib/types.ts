export type FloorPlan = {
  beds: number;
  baths: number;
  minPrice: number;
  maxPrice: number;
  minSqft?: number;
  maxSqft?: number;
};

export type ListingSource = {
  name: string;
  feed?: string;
  url: string;
};

export type Listing = {
  id: string;
  name: string;
  areaId: string;
  areaName: string;
  address: string;
  city: string;
  zip: string;
  lat?: number;
  lng?: number;
  photos: string[];
  floorPlans: FloorPlan[];
  minPrice: number;
  maxPrice: number;
  bedsMin: number;
  bedsMax: number;
  bathsMin: number;
  bathsMax: number;
  sqftMin?: number;
  sqftMax?: number;
  amenities: string[];
  description: string;
  sources: ListingSource[];
  verified: boolean;
  priceDrop: boolean;
  propertyType: string;
  qualityScore: number;
  firstSeen: string;
  lastSeen: string;
  isNew: boolean;
};

export type RunSummary = {
  runAt: string;
  sourceCounts: Record<string, number>;
  areaCounts: Record<string, { beforeQuality: number; afterQuality: number }>;
  qualityCounts: { before: number; after: number };
  dedupeMerges: number;
  errors: string[];
};
