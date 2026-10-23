import { getActiveListings, hasDatabase, latestRunTime } from "./db";
import { readSnapshot } from "./snapshot";
import type { Listing } from "./types";

export async function loadFeed(): Promise<{ listings: Listing[]; updatedAt?: string }> {
  if (hasDatabase) {
    try {
      const [listings, updatedAt] = await Promise.all([getActiveListings(), latestRunTime()]);
      if (listings.length) return { listings, updatedAt };
    } catch (error) {
      console.error("[feed] database unavailable", error);
    }
  }
  const snapshot = await readSnapshot();
  return { listings: snapshot.listings, updatedAt: snapshot.updatedAt };
}
