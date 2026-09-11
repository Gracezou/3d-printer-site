import type { NextConfig } from 'next';

const remotePatterns: NonNullable<NextConfig['images']>['remotePatterns'] = [];
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

if (supabaseUrl) {
  const storageUrl = new URL(supabaseUrl);
  remotePatterns.push({
    protocol: storageUrl.protocol === 'http:' ? 'http' : 'https',
    hostname: storageUrl.hostname,
    port: storageUrl.port,
    pathname: '/storage/v1/object/public/**',
  });
}

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  images: { remotePatterns },
};

export default nextConfig;
