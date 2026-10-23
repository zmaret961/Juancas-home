import type { Listing } from "./types";

const FEATURE_WORDS = ["laundry", "washer", "dryer", "parking", "air conditioning", "a/c", "balcony", "patio"];

function hasNonDescriptionRequirements(listing: Listing): boolean {
  return listing.photos.length >= 6 &&
    listing.minPrice > 0 &&
    Number.isFinite(listing.bedsMin) &&
    Number.isFinite(listing.bathsMin);
}

export function hasSufficientDescriptionOrAmenities(listing: Listing): boolean {
  const description = listing.description.trim();
  return description.length >= 150 || (!description && listing.amenities.length >= 6);
}

function scoreWithoutDescriptionBonus(listing: Listing): number {
  const photos = listing.photos.length;
  const richAmenities = listing.amenities.length;
  let score = 1;
  score += photos >= 12 ? 3 : photos >= 8 ? 2 : 1;
  if (listing.sqftMin) score += 1;
  if (richAmenities >= 4) score += 2;
  if (listing.verified) score += 2;
  const amenityText = listing.amenities.join(" ").toLowerCase();
  score += FEATURE_WORDS.filter((feature) => amenityText.includes(feature)).length;
  return score;
}

export function passesNonDescriptionQuality(listing: Listing): boolean {
  return hasNonDescriptionRequirements(listing) && scoreWithoutDescriptionBonus(listing) >= 4;
}

export function qualityScore(listing: Listing): number {
  if (!hasNonDescriptionRequirements(listing) || !hasSufficientDescriptionOrAmenities(listing)) return 0;
  return scoreWithoutDescriptionBonus(listing) + (listing.description.trim().length >= 300 ? 1 : 0);
}

export function passesQuality(listing: Listing): boolean {
  return qualityScore(listing) >= 5;
}
