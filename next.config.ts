import type { NextConfig } from "next";

/**
 * Baseline security headers. The Content-Security-Policy is deliberately absent
 * until M7, when Stripe Elements' script and frame origins are known — a CSP
 * guessed now would either be wrong or be widened until it means nothing.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
