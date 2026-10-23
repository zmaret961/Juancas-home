import type { Listing } from "../types";

export type SourceResult = {
  source: string;
  listings: Listing[];
  pages: number;
  merges?: number;
};

export interface ListingSourceAdapter {
  readonly name: string;
  fetchListings(): Promise<SourceResult>;
}
