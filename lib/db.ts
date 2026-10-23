import postgres from "postgres";
import type { Listing, RunSummary } from "./types";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let client: ReturnType<typeof postgres> | undefined;
let schemaReady: Promise<void> | undefined;

export const hasDatabase = Boolean(connectionString);

function sql() {
  if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is not configured");
  client ||= postgres(connectionString, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : "require",
  });
  return client;
}

export async function ensureTables(): Promise<void> {
  if (!hasDatabase) return;
  schemaReady ||= (async () => {
    const db = sql();
    await db`
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        first_seen TIMESTAMPTZ NOT NULL,
        last_seen TIMESTAMPTZ NOT NULL
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS favorites (
        listing_id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS listing_descriptions (
        listing_id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS runs (
        id BIGSERIAL PRIMARY KEY,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
        area_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
        errors JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `;
  })();
  return schemaReady;
}

export async function getActiveListings(): Promise<Listing[]> {
  await ensureTables();
  const rows = await sql()<{ data: Listing }[]>`SELECT data FROM listings WHERE active = TRUE`;
  return rows.map((row) => row.data);
}

export async function getDescriptionCache(): Promise<Record<string, string>> {
  await ensureTables();
  const rows = await sql()<{ listing_id: string; description: string }[]>`
    SELECT listing_id, description FROM listing_descriptions
  `;
  return Object.fromEntries(rows.map((row) => [row.listing_id, row.description]));
}

export async function saveDescriptionCache(descriptions: Record<string, string>): Promise<void> {
  await ensureTables();
  const entries = Object.entries(descriptions).filter(([, description]) => Boolean(description.trim()));
  if (!entries.length) return;
  const db = sql();
  await db.begin(async (transaction) => {
    for (const [listingId, description] of entries) {
      await transaction`
        INSERT INTO listing_descriptions (listing_id, description)
        VALUES (${listingId}, ${description})
        ON CONFLICT (listing_id) DO UPDATE SET
          description = EXCLUDED.description,
          updated_at = NOW()
      `;
    }
  });
}

export async function getFavoriteSnapshots(): Promise<Listing[]> {
  await ensureTables();
  const rows = await sql()<{ data: Listing }[]>`SELECT data FROM favorites ORDER BY created_at DESC`;
  return rows.map((row) => row.data);
}

export async function addFavorite(listing: Listing): Promise<void> {
  await ensureTables();
  await sql()`INSERT INTO favorites (listing_id, data) VALUES (${listing.id}, ${sql().json(listing)})
    ON CONFLICT (listing_id) DO UPDATE SET data = EXCLUDED.data`;
}

export async function removeFavorite(id: string): Promise<void> {
  await ensureTables();
  await sql()`DELETE FROM favorites WHERE listing_id = ${id}`;
}

export async function persistRefresh(listings: Listing[], summary: RunSummary): Promise<void> {
  await ensureTables();
  const db = sql();
  await db.begin(async (transaction) => {
    for (const listing of listings) {
      await transaction`
        INSERT INTO listings (id, data, active, first_seen, last_seen)
        VALUES (
          ${listing.id},
          ${transaction.json(listing)},
          TRUE,
          ${listing.firstSeen},
          ${listing.lastSeen}
        )
        ON CONFLICT (id) DO UPDATE SET
          data = EXCLUDED.data,
          active = TRUE,
          last_seen = EXCLUDED.last_seen
      `;
    }
    if (listings.length > 0) {
      await transaction`
        UPDATE listings SET active = FALSE
        WHERE active = TRUE AND id NOT IN ${transaction(listings.map((listing) => listing.id))}
      `;
    }
    await transaction`
      INSERT INTO runs (run_at, source_counts, area_counts, errors)
      VALUES (${summary.runAt}, ${transaction.json(summary.sourceCounts)}, ${transaction.json(summary.areaCounts)}, ${transaction.json(summary.errors)})
    `;
  });
}

export async function latestRunTime(): Promise<string | undefined> {
  await ensureTables();
  const rows = await sql()<{ run_at: Date }[]>`
    SELECT run_at FROM runs
    WHERE jsonb_array_length(errors) = 0
    ORDER BY run_at DESC
    LIMIT 1
  `;
  return rows[0]?.run_at.toISOString();
}
