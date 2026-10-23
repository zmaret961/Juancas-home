import { AREAS } from "./areas";
import { dedupeListings } from "./dedupe";
import { hasDatabase, getActiveListings, persistRefresh } from "./db";
import { passesQuality, qualityScore } from "./quality";
import { readSnapshot } from "./snapshot";
import type { ListingSourceAdapter } from "./sources/interface";
import { RentComAdapter } from "./sources/rent";
import type { AreaDropReasons, AreaFetchStatus, Listing, RunSummary } from "./types";

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
  const sourceAreaStatus: Record<string, AreaFetchStatus> = {};
  const collected: Listing[] = [];
  let sourceMerges = 0;
  for (const adapter of adapters) {
    try {
      const result = await adapter.fetchListings();
      sourceCounts[result.source] = result.listings.length;
      Object.assign(sourceAreaStatus, result.areaStatus || {});
      sourceMerges += result.merges || 0;
      collected.push(...result.listings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${adapter.name}: ${message}`);
      const emptyDropReasons: AreaDropReasons = {
        outsideCoastalBox: 0,
        overBudget: 0,
        wrongType: 0,
        fewerThanSixPhotos: 0,
        missingDescription: 0,
        belowScore: 0,
      };
      for (const area of AREAS) {
        sourceAreaStatus[area.id] ||= {
          status: "failed",
          rawCount: 0,
          pages: 0,
          retries: 0,
          paths: [],
          dropReasons: emptyDropReasons,
        };
      }
      console.error(`[refresh] ${adapter.name} failed; preserving the previous snapshot: ${message}`);
    }
  }

  const emptyDropReasons: AreaDropReasons = {
    outsideCoastalBox: 0,
    overBudget: 0,
    wrongType: 0,
    fewerThanSixPhotos: 0,
    missingDescription: 0,
    belowScore: 0,
  };
  const areaCounts: RunSummary["areaCounts"] = {};
  for (const area of AREAS) {
    const inArea = collected.filter((listing) => listing.areaId === area.id);
    const status = sourceAreaStatus[area.id];
    areaCounts[area.id] = {
      status: status?.status || "unreported",
      rawCount: status?.rawCount || 0,
      pages: status?.pages || 0,
      retries: status?.retries || 0,
      paths: status?.paths || [],
      dropReasons: status?.dropReasons || emptyDropReasons,
      beforeQuality: inArea.length,
      afterQuality: inArea.filter(passesQuality).length,
    };
  }

  if (collected.length === 0) {
    for (const area of AREAS) {
      areaCounts[area.id].afterQuality = previous.filter((listing) => listing.areaId === area.id).length;
    }
    const summary: RunSummary = {
      runAt,
      sourceCounts,
      areaCounts,
      qualityCounts: { before: 0, after: previous.length },
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
  const currentIds = new Set(qualityListings.map((listing) => listing.id));
  const retainedPrevious = previous.filter((listing) => {
    const status = sourceAreaStatus[listing.areaId]?.status;
    return !currentIds.has(listing.id) &&
      (status === "partial" || status === "failed" || status === "timed-out");
  });
  const activeListings = [...qualityListings, ...retainedPrevious];
  const outputListings = activeListings.length ? activeListings : previous;
  if (qualityListings.length === 0) {
    errors.push("No listings passed the quality filter; preserved the previous snapshot");
  }
  for (const area of AREAS) {
    areaCounts[area.id].afterQuality = outputListings.filter((listing) => listing.areaId === area.id).length;
  }

  const summary: RunSummary = {
    runAt,
    sourceCounts,
    areaCounts,
    qualityCounts: { before: collected.length, after: outputListings.length },
    dedupeMerges: sourceMerges + deduped.merges,
    errors,
  };
  if (hasDatabase) {
    await persistRefresh(outputListings, summary);
  }
  return { listings: outputListings, summary };
}
