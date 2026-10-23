import { areaForPoint, AREAS } from "../areas";
import { qualityScore } from "../quality";
import type { FloorPlan, Listing } from "../types";
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

async function getText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(25000),
  });
  if (response.status !== 200) throw new Error(`Rent.com returned ${response.status} for ${url}`);
  return response.text();
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

async function getDescription(pathname: string): Promise<string> {
  try {
    const html = await getText(`${HOST}${pathname}`);
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
    id: `rent-${String(listing.id || listing.sourceId || pathname.split("/").pop())}`,
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

async function fetchArea(path: string): Promise<{ listings: RentListing[]; pages: number }> {
  const all: RentListing[] = [];
  const first = parsePage(await getText(`${HOST}${path}`));
  all.push(...first.listings);
  const pages = Math.min(Math.ceil(first.total / Math.max(first.listings.length, 1)), 8);
  for (let page = 2; page <= pages; page++) {
    await wait(650);
    const url = new URL(`${HOST}${path}`);
    url.searchParams.set("page", String(page));
    const next = parsePage(await getText(url.toString()));
    if (!next.listings.length) break;
    all.push(...next.listings);
  }
  return { listings: all, pages };
}

export class RentComAdapter implements ListingSourceAdapter {
  readonly name = "Rent.com";

  async fetchListings(): Promise<SourceResult> {
    const found: RentListing[] = [];
    let pages = 0;
    let merges = 0;
    for (const area of AREAS) {
      const response = await fetchArea(area.searchPath);
      found.push(...response.listings);
      pages += response.pages;
      await wait(550);
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
      } else {
        converted.set(listing.id, listing);
      }
    }

    const candidates = [...converted.values()];
    for (const listing of candidates) {
      if (
        (listing.sources[0]?.url.includes("/apartment/") || listing.sources[0]?.url.includes("/condo/")) &&
        listing.photos.length >= 6 &&
        listing.minPrice <= 3500
      ) {
        listing.description = await getDescription(new URL(listing.sources[0].url).pathname);
        await wait(200);
      }
      listing.qualityScore = qualityScore(listing);
    }
    return { source: this.name, listings: candidates, pages, merges };
  }
}
