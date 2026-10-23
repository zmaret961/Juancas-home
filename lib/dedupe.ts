import type { Listing } from "./types";

const normalized = (value: string) =>
  value.toLowerCase().replace(/\b(apartment|apartments|condo|the|unit|suite)\b/g, "").replace(/[^a-z0-9]/g, "");

function near(a: Listing, b: Listing): boolean {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return false;
  const latMeters = (a.lat - b.lat) * 111_000;
  const lngMeters = (a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(latMeters, lngMeters) <= 40;
}

export function dedupeListings(input: Listing[]): { listings: Listing[]; merges: number } {
  const result: Listing[] = [];
  let merges = 0;
  for (const listing of input) {
    const addressKey = `${normalized(listing.address)}-${listing.zip}`;
    const duplicate = result.find((existing) => {
      const existingAddressKey = `${normalized(existing.address)}-${existing.zip}`;
      if (normalized(listing.address) && normalized(existing.address) && listing.zip && existing.zip && addressKey === existingAddressKey) return true;
      const similarName = normalized(existing.name) === normalized(listing.name);
      const similarPrice = Math.abs(existing.minPrice - listing.minPrice) <= 250;
      return near(existing, listing) && similarName && similarPrice;
    });
    if (!duplicate) {
      result.push({ ...listing, photos: [...listing.photos], sources: [...listing.sources] });
      continue;
    }
    merges += 1;
    if (listing.photos.length > duplicate.photos.length) duplicate.photos = listing.photos;
    duplicate.sources = [
      ...duplicate.sources,
      ...listing.sources.filter((source) => !duplicate.sources.some((existing) => existing.url === source.url)),
    ];
    duplicate.amenities = Array.from(new Set([...duplicate.amenities, ...listing.amenities]));
    duplicate.floorPlans = [...duplicate.floorPlans, ...listing.floorPlans];
    duplicate.description = duplicate.description.length >= listing.description.length ? duplicate.description : listing.description;
    duplicate.verified ||= listing.verified;
    duplicate.priceDrop ||= listing.priceDrop;
  }
  return { listings: result, merges };
}
