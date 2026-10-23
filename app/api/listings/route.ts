import { NextResponse } from "next/server";
import { loadFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadFeed());
}
