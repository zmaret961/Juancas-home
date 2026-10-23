import { NextResponse } from "next/server";
import { getActiveListings, hasDatabase, latestRunTime } from "@/lib/db";
import { readSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  if (hasDatabase) {
    try {
      const [listings, updatedAt] = await Promise.all([getActiveListings(), latestRunTime()]);
      return NextResponse.json({ listings, updatedAt });
    } catch (error) {
      console.error("[api/listings] database unavailable", error);
    }
  }
  return NextResponse.json(await readSnapshot());
}
