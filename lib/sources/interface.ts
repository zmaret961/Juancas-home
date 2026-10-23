import type { AreaFetchStatus, Listing } from "../types";

export type SourceResult = {
  source: string;
  listings: Listing[];
  pages: number;
  merges?: number;
  areaStatus?: Record<string, AreaFetchStatus>;
};

export interface ListingSourceAdapter {
  readonly name: string;
  fetchListings(): Promise<SourceResult>;
}
