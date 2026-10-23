import { NextRequest, NextResponse } from "next/server";
import { addFavorite, getFavoriteSnapshots, hasDatabase, removeFavorite } from "@/lib/db";
import type { Listing } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabase) return NextResponse.json({ favorites: [], database: false });
  try {
    return NextResponse.json({ favorites: await getFavoriteSnapshots(), database: true });
  } catch (error) {
    console.error("[api/favorites] database unavailable", error);
    return NextResponse.json({ favorites: [], database: true, error: "Favorites are temporarily unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!hasDatabase) return NextResponse.json({ saved: false, database: false });
  try {
    const listing = await request.json() as Listing;
    if (!listing?.id) return NextResponse.json({ error: "A listing snapshot is required" }, { status: 400 });
    await addFavorite(listing);
    return NextResponse.json({ saved: true, database: true });
  } catch (error) {
    console.error("[api/favorites] save failed", error);
    return NextResponse.json({ error: "Could not save favorite" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasDatabase) return NextResponse.json({ deleted: false, database: false });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "A listing id is required" }, { status: 400 });
  try {
    await removeFavorite(id);
    return NextResponse.json({ deleted: true, database: true });
  } catch (error) {
    console.error("[api/favorites] delete failed", error);
    return NextResponse.json({ error: "Could not remove favorite" }, { status: 500 });
  }
}
