import { areaForPoint, AREAS } from "../areas";
import type { AreaConfig } from "../areas";
import { hasSufficientDescriptionOrAmenities, passesQuality, qualityScore } from "../quality";
import type { AreaDropReasons, AreaFetchStatus, AreaPathStatus, FloorPlan, Listing } from "../types";
import type { ListingSourceAdapter, SourceResult } from "./interface";

const HOST = "https://www.rent.com";
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

type RentPhoto = { id?: string };
type RentFloorPlan = {
  bedCount?: unknown;
  bathCount?: unknown;
  priceRange?: { min?: unknown; max?: unknown };
  sqFtRange?: { min?: unknown; max?: unknown };
  photos?: RentPhoto[];
};
type RentListing = {
  id?: string;
  sourceId?: string;
  name?: string;
  propertyType?: string;
  location?: { lat?: unknown; lng?: unknown; city?: string; zip?: string };
  optimizedPhotos?: RentPhoto[];
  floorPlans?: RentFloorPlan[];
  urlPathname?: string;
  amenitiesHighlighted?: string[];
  hasPriceDrops?: boolean;
  verified?: boolean;
  address?: string;
  addressFull?: string;
  zipCode?: string;
  tplsource?: string;
};
type RentPageData = {
  pageNumber?: number;
  location?: { listingSearch?: { total?: number; listings?: RentListing[] } };
};
type RentHtmlData = { props?: { pageProps?: { pageData?: RentPageData } } };
type RentPage = {
  total: number;
  listings: RentListing[];
  pageNumber: number;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const retryDelays = [5000, 15000, 30000];
const maxRunMs = 240_000;
const maxRequestMs = 20_000;

type RequestState = {
  deadline: number;
  nextRequestAt: number;
  retries: number;
  blockedError?: string;
};

function spacingDelay(): number {
  return 1000 + Math.random() * 1000;
}

function isRetryableStatus(status: number): boolean {
  return status === 202 || status === 429 || (status >= 500 && status <= 599);
}

async function waitBeforeRetry(state: RequestState, attempt: number, error: Error): Promise<void> {
  const backoff = retryDelays[attempt] * (0.8 + Math.random() * 0.4);
  const spacing = Math.max(0, state.nextRequestAt - Date.now());
  if (Date.now() + spacing + backoff + 1000 >= state.deadline) {
    throw new Error(`${error.message}; retry would exceed the Rent.com run budget`);
  }
  state.retries += 1;
  await wait(backoff);
}

async function getText(url: string, state: RequestState): Promise<string> {
  if (state.blockedError) throw new Error(`Rent.com requests paused after repeated source failures: ${state.blockedError}`);
  let lastError = new Error(`Rent.com request failed for ${url}`);
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (state.blockedError) throw new Error(`Rent.com requests paused after repeated source failures: ${state.blockedError}`);
    const spacing = Math.max(0, state.nextRequestAt - Date.now());
    if (Date.now() + spacing >= state.deadline) {
      throw new Error(`Rent.com refresh time budget exhausted before requesting ${url}`);
    }
    if (spacing > 0) await wait(spacing);
    const remaining = state.deadline - Date.now();
    if (remaining <= 0) throw new Error(`Rent.com refresh time budget exhausted before requesting ${url}`);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(Math.min(maxRequestMs, remaining)),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      state.nextRequestAt = Date.now() + spacingDelay();
      if (attempt === retryDelays.length) {
        state.blockedError = lastError.message;
        throw lastError;
      }
      if (Date.now() >= state.deadline) throw lastError;
      await waitBeforeRetry(state, attempt, lastError);
      continue;
    }

    if (response.status === 200) {
      try {
        const text = await response.text();
        state.nextRequestAt = Date.now() + spacingDelay();
        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        state.nextRequestAt = Date.now() + spacingDelay();
        if (attempt === retryDelays.length) {
          state.blockedError = lastError.message;
          throw lastError;
        }
        if (Date.now() >= state.deadline) throw lastError;
        await waitBeforeRetry(state, attempt, lastError);
        continue;
      }
    }

    lastError = new Error(`Rent.com returned ${response.status} for ${url}`);
    state.nextRequestAt = Date.now() + spacingDelay();
    if (!isRetryableStatus(response.status)) throw lastError;
    if (attempt === retryDelays.length) {
      state.blockedError = lastError.message;
      throw lastError;
    }
    await waitBeforeRetry(state, attempt, lastError);
  }
  throw lastError;
}

function parsePage(html: string): RentPage {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Rent.com page did not contain __NEXT_DATA__");
  const data = JSON.parse(match[1]) as RentHtmlData;
  const pageData = data.props?.pageProps?.pageData;
  const listingSearch = pageData?.location?.listingSearch;
  if (!listingSearch) throw new Error("Rent.com page did not contain listing search data");
  return {
    total: Number(listingSearch.total) || 0,
    listings: listingSearch.listings || [],
    pageNumber: Number(pageData.pageNumber) || 1,
  };
}

const num = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function planFromRent(plan: RentFloorPlan): FloorPlan | undefined {
  const minPrice = num(plan.priceRange?.min);
  const maxPrice = num(plan.priceRange?.max);
  const beds = num(plan.bedCount);
  const baths = num(plan.bathCount);
  if (minPrice == null || maxPrice == null || beds == null || baths == null) return undefined;
  return {
    beds,
    baths,
    minPrice,
    maxPrice,
    minSqft: num(plan.sqFtRange?.min),
    maxSqft: num(plan.sqFtRange?.max),
  };
}

function photosFromRent(listing: RentListing): string[] {
  const ids = (listing.optimizedPhotos || [])
    .map((photo) => photo.id)
    .filter((id): id is string => Boolean(id));
  const floorPlanPhotos = (listing.floorPlans || []).flatMap((plan) =>
    (plan.photos || []).map((photo) => photo.id).filter((id): id is string => Boolean(id))
  );
  const all = [...new Set([...ids, ...floorPlanPhotos])];
  return all.map((id) => `https://i.rent.com/t_3x2_fixed_webp_lg/${id}`);
}

function listingId(listing: RentListing): string {
  return `rent-${rawKey(listing)}`;
}

function rawKey(listing: RentListing): string {
  return String(
    listing.id ||
      listing.sourceId ||
      listing.urlPathname ||
      `${listing.name || ""}-${listing.location?.zip || ""}-${listing.location?.lat || ""}-${listing.location?.lng || ""}`,
  );
}

function mergeRawListing(target: RentListing, incoming: RentListing): void {
  if (photosFromRent(incoming).length > photosFromRent(target).length) {
    target.optimizedPhotos = incoming.optimizedPhotos;
  }
  if ((incoming.floorPlans?.length || 0) > (target.floorPlans?.length || 0)) {
    target.floorPlans = incoming.floorPlans;
  }
  target.amenitiesHighlighted = Array.from(
    new Set([...(target.amenitiesHighlighted || []), ...(incoming.amenitiesHighlighted || [])]),
  );
  target.verified ||= incoming.verified;
  target.hasPriceDrops ||= incoming.hasPriceDrops;
}

async function getDescription(pathname: string, state: RequestState): Promise<string> {
  try {
    const html = await getText(`${HOST}${pathname}`, state);
    const candidates = [
      /"description"\s*:\s*"((?:\\.|[^"\\])*)"/g,
      /"propertyDescription"\s*:\s*"((?:\\.|[^"\\])*)"/g,
    ];
    for (const pattern of candidates) {
      const match = pattern.exec(html);
      if (match?.[1]) {
        const decoded = JSON.parse(`"${match[1]}"`).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        if (decoded.length >= 80) return decoded;
      }
    }
  } catch (error) {
    console.warn(`[rent] detail description unavailable: ${error instanceof Error ? error.message : error}`);
  }
  return "";
}

function convert(listing: RentListing): Listing | undefined {
  const location = listing.location || {};
  const area = areaForPoint(num(location.lat), num(location.lng));
  if (!area) return undefined;
  const propertyType = String(listing.propertyType || "").toUpperCase();
  if (!(propertyType.includes("APARTMENT") || propertyType.includes("CONDO"))) return undefined;
  const floorPlans: FloorPlan[] = (listing.floorPlans || [])
    .map(planFromRent)
    .filter((plan: FloorPlan | undefined): plan is FloorPlan => Boolean(plan))
    .filter((plan: FloorPlan) => plan.minPrice <= 3500);
  if (!floorPlans.length) return undefined;
  const beds = floorPlans.map((plan) => plan.beds);
  const baths = floorPlans.map((plan) => plan.baths);
  const squareFeet = floorPlans.flatMap((plan) => [plan.minSqft, plan.maxSqft]).filter((n): n is number => n != null);
  const photos = photosFromRent(listing);
  const amenities = Array.from(new Set((listing.amenitiesHighlighted || []).map(String)));
  const pathname = String(listing.urlPathname || "");
  const address = String(listing.address || listing.addressFull || listing.name || "").split(",")[0].trim();
  const listingResult: Listing = {
    id: listingId(listing),
    name: String(listing.name || address),
    areaId: area.id,
    areaName: area.name,
    address,
    city: String(location.city || ""),
    zip: String(location.zip || listing.zipCode || ""),
    lat: num(location.lat),
    lng: num(location.lng),
    photos,
    floorPlans,
    minPrice: Math.min(...floorPlans.map((plan) => plan.minPrice)),
    maxPrice: Math.max(...floorPlans.map((plan) => plan.maxPrice)),
    bedsMin: Math.min(...beds),
    bedsMax: Math.max(...beds),
    bathsMin: Math.min(...baths),
    bathsMax: Math.max(...baths),
    sqftMin: squareFeet.length ? Math.min(...squareFeet) : undefined,
    sqftMax: squareFeet.length ? Math.max(...squareFeet) : undefined,
    amenities,
    description: "",
    sources: [{
      name: "Rent.com",
      feed: listing.tplsource ? String(listing.tplsource) : undefined,
      url: pathname ? `${HOST}${pathname}` : HOST,
    }],
    verified: Boolean(listing.verified),
    priceDrop: Boolean(listing.hasPriceDrops),
    propertyType,
    qualityScore: 0,
    firstSeen: "",
    lastSeen: "",
    isNew: false,
  };
  listingResult.qualityScore = qualityScore(listingResult);
  return listingResult;
}

function addUniqueRaw(
  listings: Map<string, RentListing>,
  incoming: RentListing,
): boolean {
  const key = rawKey(incoming);
  const existing = listings.get(key);
  if (!existing) {
    listings.set(key, incoming);
    return false;
  }
  mergeRawListing(existing, incoming);
  return true;
}

function isInsideArea(listing: RentListing, area: AreaConfig): boolean {
  const lat = num(listing.location?.lat);
  const lng = num(listing.location?.lng);
  return lat != null && lng != null &&
    lat <= area.bounds.north && lat >= area.bounds.south &&
    lng <= area.bounds.east && lng >= area.bounds.west;
}

function emptyDropReasons(): AreaDropReasons {
  return {
    outsideCoastalBox: 0,
    overBudget: 0,
    wrongType: 0,
    fewerThanSixPhotos: 0,
    missingDescription: 0,
    belowScore: 0,
  };
}

function fetchStatus(
  status: AreaFetchStatus["status"],
  rawCount = 0,
  pages = 0,
  retries = 0,
  paths: AreaPathStatus[] = [],
  dropReasons = emptyDropReasons(),
): AreaFetchStatus {
  return { status, rawCount, pages, retries, paths, dropReasons };
}

async function fetchArea(
  area: AreaConfig,
  state: RequestState,
): Promise<{ listings: RentListing[]; status: AreaFetchStatus; merges: number }> {
  const uniqueListings = new Map<string, RentListing>();
  const pathResults: AreaPathStatus[] = [];
  let pages = 0;
  let merges = 0;

  for (const path of area.searchPaths) {
    if (state.blockedError) {
      pathResults.push({
        path,
        status: "skipped",
        pages: 0,
        listings: 0,
        error: `Rent.com request circuit is open: ${state.blockedError}`,
      });
      continue;
    }
    if (Date.now() >= state.deadline) {
      pathResults.push({
        path,
        status: "skipped",
        pages: 0,
        listings: 0,
        error: "Run time budget exhausted before this search",
      });
      continue;
    }

    const pageStart = pages;
    let pathListings = 0;
    let errorMessage: string | undefined;
    try {
      const first = parsePage(await getText(`${HOST}${path}`, state));
      pages += 1;
      pathListings += first.listings.length;
      for (const listing of first.listings) {
        if (addUniqueRaw(uniqueListings, listing)) merges += 1;
      }

      const totalPages = Math.min(Math.ceil(first.total / Math.max(first.listings.length, 1)), 8);
      for (let page = 2; page <= totalPages; page += 1) {
        if (Date.now() >= state.deadline) throw new Error("Run time budget exhausted during pagination");
        const url = new URL(`${HOST}${path}`);
        url.searchParams.set("page", String(page));
        const next = parsePage(await getText(url.toString(), state));
        pages += 1;
        pathListings += next.listings.length;
        for (const listing of next.listings) {
          if (addUniqueRaw(uniqueListings, listing)) merges += 1;
        }
        if (!next.listings.length) break;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const pathPages = pages - pageStart;
    pathResults.push({
      path,
      status: errorMessage ? (pathPages > 0 ? "partial" : "failed") : "ok",
      pages: pathPages,
      listings: pathListings,
      ...(errorMessage ? { error: errorMessage } : {}),
    });
  }

  const successCount = pathResults.filter((result) => result.status === "ok" || result.status === "partial").length;
  const hasSkipped = pathResults.some((result) => result.status === "skipped");
  const hasFailed = pathResults.some((result) => result.status === "failed" || result.status === "partial");
  const timedOut = pathResults.some((result) => result.error?.includes("time budget"));
  const status: AreaFetchStatus["status"] = successCount === 0
    ? (timedOut ? "timed-out" : "failed")
    : hasSkipped || hasFailed
      ? "partial"
      : "ok";

  return {
    listings: [...uniqueListings.values()],
    status: fetchStatus(status, uniqueListings.size, pages, 0, pathResults),
    merges,
  };
}

export class RentComAdapter implements ListingSourceAdapter {
  readonly name = "Rent.com";

  async fetchListings(): Promise<SourceResult> {
    const found: RentListing[] = [];
    let pages = 0;
    let merges = 0;
    const state: RequestState = {
      deadline: Date.now() + maxRunMs,
      nextRequestAt: 0,
      retries: 0,
    };
    const areaResults: Record<string, { listings: RentListing[]; status: AreaFetchStatus }> = {};

    for (const area of AREAS) {
      const retriesBefore = state.retries;
      const response = await fetchArea(area, state);
      response.status.retries = state.retries - retriesBefore;
      areaResults[area.id] = { listings: response.listings, status: response.status };
      found.push(...response.listings);
      pages += response.status.pages;
      merges += response.merges;
    }

    const converted = new Map<string, Listing>();
    for (const raw of found) {
      const listing = convert(raw);
      if (!listing) continue;
      const current = converted.get(listing.id);
      if (current) {
        merges += 1;
        if (listing.photos.length > current.photos.length) current.photos = listing.photos;
        current.sources.push(...listing.sources.filter((source) => !current.sources.some((existing) => existing.url === source.url)));
        current.amenities = Array.from(new Set([...current.amenities, ...listing.amenities]));
        current.floorPlans = [...current.floorPlans, ...listing.floorPlans];
        current.description = current.description.length >= listing.description.length ? current.description : listing.description;
      } else {
        converted.set(listing.id, listing);
      }
    }

    const candidates = [...converted.values()];
    for (const listing of candidates) {
      if (state.blockedError) break;
      if (
        listing.sources[0]?.url &&
        new URL(listing.sources[0].url).pathname !== "/" &&
        listing.photos.length >= 6 &&
        listing.minPrice <= 3500
      ) {
        if (state.deadline - Date.now() < 5000) break;
        const retriesBefore = state.retries;
        listing.description = await getDescription(new URL(listing.sources[0].url).pathname, state);
        const areaStatusForListing = areaResults[listing.areaId]?.status;
        if (areaStatusForListing) areaStatusForListing.retries += state.retries - retriesBefore;
      }
      listing.qualityScore = qualityScore(listing);
    }

    const areaStatus: Record<string, AreaFetchStatus> = {};
    for (const area of AREAS) {
      const result = areaResults[area.id];
      const dropReasons = emptyDropReasons();
      for (const raw of result?.listings || []) {
        if (!isInsideArea(raw, area)) {
          dropReasons.outsideCoastalBox += 1;
          continue;
        }
        if (!String(raw.propertyType || "").toUpperCase().match(/APARTMENT|CONDO/)) {
          dropReasons.wrongType += 1;
          continue;
        }
        const hasAffordablePlan = (raw.floorPlans || []).some((plan) => {
          const minPrice = num(plan.priceRange?.min);
          return minPrice != null && minPrice <= 3500;
        });
        if (!hasAffordablePlan) {
          dropReasons.overBudget += 1;
          continue;
        }
        if (photosFromRent(raw).length < 6) {
          dropReasons.fewerThanSixPhotos += 1;
          continue;
        }
        const listing = converted.get(listingId(raw));
        if (!listing) {
          dropReasons.belowScore += 1;
          continue;
        }
        if (!hasSufficientDescriptionOrAmenities(listing)) {
          dropReasons.missingDescription += 1;
          continue;
        }
        if (!passesQuality(listing)) dropReasons.belowScore += 1;
      }
      areaStatus[area.id] = {
        ...(result?.status || fetchStatus("failed")),
        dropReasons,
      };
    }

    return { source: this.name, listings: candidates, pages, merges, areaStatus };
  }
}
