import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Server Actions carry AI prompts and plan drafts; keep bodies small.
  experimental: { serverActions: { bodySizeLimit: '1mb' } },
  poweredByHeader: false,
};

export default nextConfig;
