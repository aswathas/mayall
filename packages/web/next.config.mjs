/**
 * Mayall web console configuration.
 *
 * Development and the normal production server keep the exact behaviour they
 * always had. A static export for GitHub Pages is opt-in only:
 *
 *   MAYALL_STATIC_EXPORT=1 MAYALL_BASE_PATH=/mayall next build
 *
 * The export branch is deliberately isolated so `npm run dev` is untouched.
 */

const isStatic = process.env.MAYALL_STATIC_EXPORT === '1';
const basePath = isStatic ? (process.env.MAYALL_BASE_PATH ?? '') : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@helix/core', '@helix/forensic-engine'],
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  ...(isStatic
    ? {
        // Static files only — GitHub Pages has no server runtime.
        output: 'export',
        trailingSlash: true,
        images: {
          unoptimized: true,
        },
        basePath,
        assetPrefix: basePath ? `${basePath}/` : '',
        // The workspace typecheck (`npm run typecheck`) is the gate; keeping a
        // second copy of it inside the export build only couples unrelated
        // packages to the deploy and slows it down.
        typescript: {
          ignoreBuildErrors: process.env.MAYALL_STATIC_SKIP_TYPECHECK === '1',
        },
      }
    : {}),
};

export default nextConfig;
