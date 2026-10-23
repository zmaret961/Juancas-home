import Home from "@/components/Home";
import { getActiveListings, hasDatabase, latestRunTime } from "@/lib/db";
import { readSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export default async function Page() {
  let listings;
  let updatedAt: string | undefined;
  if (hasDatabase) {
    try {
      [listings, updatedAt] = await Promise.all([getActiveListings(), latestRunTime()]);
    } catch {
      const snapshot = await readSnapshot();
      listings = snapshot.listings;
      updatedAt = snapshot.updatedAt;
    }
  } else {
    const snapshot = await readSnapshot();
    listings = snapshot.listings;
    updatedAt = snapshot.updatedAt;
  }
  return <Home initialListings={listings ?? []} updatedAt={updatedAt} />;
}
