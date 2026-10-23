import { NextRequest, NextResponse } from "next/server";
import { refreshListings } from "@/lib/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const localHour = (date: Date) =>
  Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date));

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const forced = request.nextUrl.searchParams.get("force") === "1";
  const now = new Date();
  if (!forced && localHour(now) !== 7) {
    return NextResponse.json({ skipped: true, reason: "Refresh runs during the 7 AM Pacific hour" });
  }
  try {
    const result = await refreshListings();
    return NextResponse.json({
      refreshed: true,
      updatedAt: result.summary.runAt,
      listingCount: result.listings.length,
      summary: result.summary,
    });
  } catch (error) {
    console.error("[cron/refresh] refresh failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Refresh failed" }, { status: 500 });
  }
}
