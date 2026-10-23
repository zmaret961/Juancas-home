import { AREAS } from "./areas";
import { dedupeListings } from "./dedupe";
import { hasDatabase, getActiveListings, persistRefresh } from "./db";
import { passesQuality, qualityScore } from "./quality";
import { readSnapshot } from "./snapshot";
import type { ListingSourceAdapter } from "./sources/interface";
import { RentComAdapter } from "./sources/rent";
import type { Listing, RunSummary } from "./types";

export type RefreshResult = { listings: Listing[]; summary: RunSummary };

const sourceAdapters: ListingSourceAdapter[] = [new RentComAdapter()];

export async function refreshListings(adapters: ListingSourceAdapter[] = sourceAdapters): Promise<RefreshResult> {
  const runAt = new Date().toISOString();
  const errors: string[] = [];
  let previous: Listing[] = [];
  if (hasDatabase) {
    try {
      previous = await getActiveListings();
    } catch (error) {
      errors.push(`Database read failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    previous = (await readSnapshot()).listings;
  }

  const sourceCounts: Record<string, number> = {};
  const collected: Listing[] = [];
  let sourceMerges = 0;
  for (const adapter of adapters) {
    try {
      const result = await adapter.fetchListings();
      sourceCounts[result.source] = result.listings.length;
      sourceMerges += result.merges || 0;
      collected.push(...result.listings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${adapter.name}: ${message}`);
      console.error(`[refresh] ${adapter.name} failed; preserving the previous snapshot: ${message}`);
    }
  }

  const areaCounts: RunSummary["areaCounts"] = {};
  for (const area of AREAS) {
    const inArea = collected.filter((listing) => listing.areaId === area.id);
    areaCounts[area.id] = {
      beforeQuality: inArea.length,
      afterQuality: inArea.filter(passesQuality).length,
    };
  }

  if (collected.length === 0) {
    const summary: RunSummary = {
      runAt,
      sourceCounts,
      areaCounts,
      qualityCounts: { before: 0, after: 0 },
      dedupeMerges: 0,
      errors: errors.length ? errors : ["No listings returned; preserved previous snapshot"],
    };
    if (hasDatabase && previous.length > 0) await persistRefresh(previous, summary);
    return { listings: previous, summary };
  }

  const deduped = dedupeListings(collected);
  const priorById = new Map(previous.map((listing) => [listing.id, listing]));
  const qualityListings = deduped.listings
    .map((listing) => {
      const old = priorById.get(listing.id);
      return {
        ...listing,
        firstSeen: old?.firstSeen || runAt,
        lastSeen: runAt,
        isNew: !old,
        qualityScore: qualityScore(listing),
      };
    })
    .filter(passesQuality);

  const summary: RunSummary = {
    runAt,
    sourceCounts,
    areaCounts,
    qualityCounts: { before: collected.length, after: qualityListings.length },
    dedupeMerges: sourceMerges + deduped.merges,
    errors,
  };
  if (hasDatabase) {
    await persistRefresh(qualityListings.length ? qualityListings : previous, summary);
  }
  return { listings: qualityListings.length ? qualityListings : previous, summary };
}
