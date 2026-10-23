import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { refreshListings } from "../lib/pipeline";

async function main() {
  const { listings, summary } = await refreshListings();
  if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    console.log(JSON.stringify({ ...summary, savedTo: "database", listings: listings.length }, null, 2));
    return;
  }
  const directory = path.join(process.cwd(), "data");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "listings.json"), `${JSON.stringify({ updatedAt: summary.runAt, listings, run: summary }, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, savedTo: "data/listings.json", listings: listings.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
