import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use "standalone" for Docker, default for Cloudflare Pages / Vercel.
  // The DEPLOY_TARGET env var controls this at build time.
  ...(process.env.DEPLOY_TARGET === "docker" ? { output: "standalone" } : {}),

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
