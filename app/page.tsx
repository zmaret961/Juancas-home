import Home from "@/components/Home";
import { loadFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { listings, updatedAt } = await loadFeed();
  return <Home initialListings={listings} updatedAt={updatedAt} />;
}
