import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3333").origin;
  } catch {
    return "http://localhost:3333";
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  `connect-src 'self' ${apiOrigin}`,
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Referrer-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
  turbopack: {
    root: path.resolve(__dirname, "../..")
  }
};

export default nextConfig;
