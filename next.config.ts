import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  outputFileTracingIncludes: {
    "/*": ["./data/listings.json"],
  },
};

export default nextConfig;
