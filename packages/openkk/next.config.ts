import type { NextConfig } from "next";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? String(Date.now());

const nextConfig: NextConfig = {
  devIndicators: false,
  generateBuildId: () => BUILD_ID,

  output: "export",
  images: {

    unoptimized: true,
  },

  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },

};

export default nextConfig;
