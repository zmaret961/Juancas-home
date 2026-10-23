import type { Listing } from "./types";

const FEATURE_WORDS = ["laundry", "washer", "dryer", "parking", "air conditioning", "a/c", "balcony", "patio"];

export function qualityScore(listing: Listing): number {
  const photos = listing.photos.length;
  const richAmenities = listing.amenities.length;
  const description = listing.description.trim();
  const hasRichListingDetails = description.length >= 150 || (!description && richAmenities >= 6);
  if (
    photos < 6 ||
    listing.minPrice <= 0 ||
    !Number.isFinite(listing.bedsMin) ||
    !Number.isFinite(listing.bathsMin) ||
    !hasRichListingDetails
  ) return 0;

  let score = 1;
  score += photos >= 12 ? 3 : photos >= 8 ? 2 : 1;
  if (listing.sqftMin) score += 1;
  if (richAmenities >= 4) score += 2;
  if (listing.verified) score += 2;
  const amenityText = listing.amenities.join(" ").toLowerCase();
  score += FEATURE_WORDS.filter((feature) => amenityText.includes(feature)).length;
  if (listing.description.trim().length >= 300) score += 1;
  return score;
}

export function passesQuality(listing: Listing): boolean {
  return qualityScore(listing) >= 5;
}
