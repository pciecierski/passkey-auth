import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Permissions-Policy",
          value: "publickey-credentials-create=*, publickey-credentials-get=*",
        },
      ],
    },
  ],
};

export default nextConfig;
