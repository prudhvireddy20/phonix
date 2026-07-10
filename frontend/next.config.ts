import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the Docker multi-stage build — copies only the minimal
  // production server into the runtime image (~50MB instead of ~300MB).
  output: "standalone",

  // Silence hydration noise from browser extensions in dev
  reactStrictMode: true,

  // Forward /api/* from the browser to the internal FastAPI container.
  // Only active when BACKEND_URL is set (i.e. in the Docker environment).
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) return [];
    return [
      {
        source:      "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
