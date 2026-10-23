# Juanca's Home

A mobile-first, thoughtfully filtered apartment and condo finder for San Diego. The shortlist starts in Little Italy, then follows the coast through Carlsbad Village, Encinitas and Leucadia, Cardiff-by-the-Sea, Solana Beach, Del Mar, and coastal Oceanside. Listings are capped at $3,500/month.

The app is useful immediately: it ships with a committed listings snapshot and saves favorites in the browser. Add a Neon database later to refresh listings every day and keep favorites synced across devices. Tables are created automatically the first time the app connects—there is no migration command.

## Run it locally

1. Install Node.js 20.19+ or 22.13+.
2. Run `npm install`.
3. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).

No credentials or environment variables are required to browse the committed snapshot. To refresh the snapshot from the rental source, run `npm run scrape`. The scraper takes a little time because it gathers listing details politely; it writes the result to `data/listings.json`.

## Put it on Vercel (plain-English steps)

1. Push this repository to a GitHub account that Vercel can access.
2. In Vercel, choose **Add New → Project**, find this repository, and choose **Import**. Leave the detected Next.js build settings alone.
3. You can deploy right away. The app will use its committed snapshot and browser-only favorites.
4. To enable daily updates and shared favorites, open the project’s **Storage** tab, choose **Connect Store → Marketplace Database**, and select **Neon**. Follow the prompts to create and connect the database. Neon supplies `DATABASE_URL` or `POSTGRES_URL`; this app accepts either.
5. In **Settings → Environment Variables**, add `CRON_SECRET` with a long, private random value. Apply it to Production (and Preview too, if you want scheduled refreshes there). Vercel’s scheduled requests use this value for their bearer authorization.
6. Redeploy from the **Deployments** tab so the database and secret are available to the running build.
7. To load the first current batch, open this URL while signed into the deployed project or call it from a terminal with your secret:

   ```sh
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" "https://YOUR-PROJECT.vercel.app/api/cron/refresh?force=1"
   ```

   The first connection creates the listings, favorites, and runs tables automatically. After that, scheduled refreshes run each morning. The listing count and last update appear above the feed.

Without a database the site continues using `data/listings.json`; favorites live on that browser only. For a scheduled refresh that persists new listings and cross-device favorites, connect Neon.

## How the shortlist is picked

The app includes apartments and condos, never houses or townhomes, and keeps floor plans up to $3,500/month. A coastal geofence per area prevents inland results from slipping into North County areas. Little Italy is shown first.

The **How listings are picked** sheet in the app describes the quality rule. In short, a listing must have at least six photos, a price, known bed and bath counts, and either a description of at least 150 characters or six highlighted amenities if the source has no description. A score then rewards more photos, square footage, four or more amenities, source verification, and useful in-unit features such as laundry, parking, air conditioning, and a balcony. Listings scoring fewer than five points are hidden. When listings rank within the same area, new listings come first, followed by quality and then price.

“NEW” means the listing was not in the previous successful refresh. The first refresh marks all discoveries new; a later refresh clears that flag for listings seen again. A favorite stores a copy of the listing so it remains saved even if the property goes off-market.

## Sources and refresh schedule

The scraper uses Rent.com’s publicly rendered search data and listing details, with a mobile Safari user agent and a small request cadence. Rent.com identifies original syndication feeds when available, such as “Rent.com · via Zillow feed.” The app labels the source and links back to the original page.

Zillow, Apartments.com, Trulia, and HotPads returned HTTP 403 from the research environment; Realtor.com returned HTTP 429, and Zumper served a minimal bot-check page. They are deliberately not scraped. Craigslist is not used. Redfin was also left out: while one San Diego city-wide search responded, the tested neighborhood/geographic queries returned errors or unrelated markets, and its rental detail page did not return usable page content for checking its photo URLs. A future paid or official API can be added behind the source-adapter interface in `lib/sources/`.

Vercel Hobby cron schedules are UTC-based. This project declares both `0 14 * * *` and `0 15 * * *`; the handler checks the local hour in `America/Los_Angeles` and runs only during the 7 AM hour, covering both daylight and standard time. Use `?force=1` (with the same authorization) for an intentional manual refresh. If a source fails or returns no listings, the last good data is kept rather than clearing the feed.

## Project map

- `lib/areas.ts` — allowed areas, search paths, coastal bounds, and display priority.
- `lib/sources/` — source adapters.
- `lib/quality.ts` and `lib/dedupe.ts` — shortlist scoring and cross-source merge rules.
- `lib/pipeline.ts` — refresh, ranking metadata, inactive listings, and snapshots.
- `app/api/cron/refresh/route.ts` — scheduled/manual refresh handler.
- `data/listings.json` — no-database starter snapshot.
