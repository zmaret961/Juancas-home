import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Listing, RunSummary } from "./types";

export type Snapshot = { updatedAt?: string; listings: Listing[]; run?: RunSummary };

export async function readSnapshot(): Promise<Snapshot> {
  try {
    const content = await readFile(path.join(process.cwd(), "data", "listings.json"), "utf8");
    const parsed = JSON.parse(content) as Snapshot;
    return { ...parsed, listings: Array.isArray(parsed.listings) ? parsed.listings : [] };
  } catch {
    return { listings: [] };
  }
}
