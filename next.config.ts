import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Narrative imports send NARRATIVE.md files (50–125 KB each) in
      // batches; the client keeps each batch under 3 MB. Vercel caps any
      // request at 4.5 MB.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
