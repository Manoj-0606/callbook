import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Basic hardening, mostly for the public request form: no framing (clickjacking),
  // no MIME sniffing, and don't leak full URLs to other sites.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
