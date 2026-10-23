import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type DescriptionCacheFile = {
  updatedAt?: string;
  descriptions?: Record<string, unknown>;
};

export async function readDescriptionCache(): Promise<Record<string, string>> {
  try {
    const content = await readFile(path.join(process.cwd(), "data", "descriptions.json"), "utf8");
    const parsed = JSON.parse(content) as DescriptionCacheFile;
    return Object.fromEntries(
      Object.entries(parsed.descriptions || {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim()),
      ),
    );
  } catch {
    return {};
  }
}

export async function writeDescriptionCache(descriptions: Record<string, string>): Promise<void> {
  const directory = path.join(process.cwd(), "data");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "descriptions.json"),
    `${JSON.stringify({ updatedAt: new Date().toISOString(), descriptions }, null, 2)}\n`,
  );
}
