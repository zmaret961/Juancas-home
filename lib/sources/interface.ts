import type { AreaFetchStatus, Listing, SourceRequestCounts } from "../types";

export type SourceFetchContext = {
  descriptionCache: Map<string, string>;
};

export type SourceResult = {
  source: string;
  listings: Listing[];
  pages: number;
  merges?: number;
  areaStatus?: Record<string, AreaFetchStatus>;
  requestCounts?: SourceRequestCounts;
};

export interface ListingSourceAdapter {
  readonly name: string;
  fetchListings(context?: SourceFetchContext): Promise<SourceResult>;
}
